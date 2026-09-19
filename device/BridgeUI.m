// New restricted integration around MIT ios-mcp modules; see notices/.
#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>
#import <sys/socket.h>
#import <sys/un.h>
#import <sys/stat.h>
#import <unistd.h>
#import <math.h>
#import <arpa/inet.h>
#import <stdatomic.h>
#import <stdbool.h>
#import "BridgePeer.h"
#import "ScreenManager.h"
#import "AccessibilityManager.h"
#import <objc/runtime.h>
#import <objc/message.h>
#import "TextInputManager.h"
#import "HIDManager.h"

// Reuse one synchronous Unicode chunk. No upstream ASCII fallback after partial input.
@interface TextInputManager (DeviceBridge)
- (BOOL)sendTextUsingUnicodeHID:(NSString *)text delayMs:(NSTimeInterval)delay
         characterByCharacter:(BOOL)perCharacter error:(NSString **)error;
@end

@interface IOSMCPHIDManager (DeviceBridge)
- (BOOL)performTapSequenceAtPoint:(CGPoint)point error:(NSString **)error;
@end

static NSString *const Fixture = @"dev.devicebridge.fixture";
static NSString *Epoch;
static BOOL Poisoned = NO;
static _Atomic(bool) LocallyStopped = false;
static UIWindow *Indicator;
static NSString *const SocketPath = @"/var/mobile/Library/DeviceBridge/ui.sock";

static NSDictionary *Error(NSString *code) { return @{@"error": code}; }
static double Now(void) { return NSDate.date.timeIntervalSince1970; }

static BOOL Allowed(NSDictionary *request) {
    if (LocallyStopped || [NSFileManager.defaultManager fileExistsAtPath:@"/var/mobile/Library/DeviceBridge/STOP"]) return NO;
    const char *path = "/var/db/device-bridge/lease.json";
    struct stat info;
    if (lstat(path, &info) || !S_ISREG(info.st_mode) || info.st_uid != 0 || (info.st_mode & 0022)) return NO;
    NSData *data = [NSData dataWithContentsOfFile:@"/var/db/device-bridge/lease.json"];
    NSDictionary *lease = data ? [NSJSONSerialization JSONObjectWithData:data options:0 error:nil] : nil;
    if (![lease isKindOfClass:NSDictionary.class] || ![lease[@"enabled"] isEqual:@YES] || [lease[@"expires"] doubleValue] <= Now()) return NO;
    for (NSString *key in @[@"device_id", @"session_id", @"fence"])
        if (!request[key] || ![request[key] isEqual:lease[key]]) return NO;
    NSString *scope = [request[@"op"] isEqual:@"act"] ? @"control" : @"observe";
    return [lease[@"scopes"] isKindOfClass:NSArray.class] && [lease[@"scopes"] containsObject:scope];
}

static NSDictionary *State(void) {
    NSDictionary *app = [[AccessibilityManager sharedInstance] frontmostApplicationInfo];
    NSDictionary *screen = [[ScreenManager sharedInstance] screenInfo];
    return @{@"epoch": Epoch, @"app": app[@"bundleId"] ?: @"unknown", @"pid": app[@"pid"] ?: @0,
             @"locked": screen[@"locked"] ?: NSNull.null,
             @"screen": @{@"width": screen[@"width"] ?: @0, @"height": screen[@"height"] ?: @0,
                           @"scale": screen[@"scale"] ?: @0, @"native_scale": screen[@"native_scale"] ?: @0,
                           @"orientation": screen[@"orientation"] ?: @"unknown"},
             @"screen_on": screen[@"screen_on"] ?: NSNull.null};
}
static BOOL Unlocked(NSDictionary *s) {
    return [s[@"locked"] isEqual:@NO] && [s[@"screen_on"] isEqual:@YES];
}
static BOOL Matches(NSDictionary *state, NSDictionary *expected) {
    for (NSString *key in @[@"epoch", @"app", @"pid", @"locked", @"screen"])
        if (![state[key] isEqual:expected[key]]) return NO;
    return YES;
}

@interface BridgeIndicatorController : UIViewController
@end
@implementation BridgeIndicatorController
- (void)viewDidLoad {
    [super viewDidLoad];
    self.view.backgroundColor = [UIColor colorWithRed:0.65 green:0 blue:0 alpha:0.95];
    UIButton *stop = [UIButton buttonWithType:UIButtonTypeSystem];
    stop.frame = self.view.bounds;
    stop.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
    [stop setTitle:@"BRIDGE ACTIVE • TAP TO STOP" forState:UIControlStateNormal];
    [stop setTitleColor:UIColor.whiteColor forState:UIControlStateNormal];
    stop.titleLabel.font = [UIFont boldSystemFontOfSize:12];
    [stop addTarget:self action:@selector(stopNow) forControlEvents:UIControlEventTouchUpInside];
    [self.view addSubview:stop];
}
- (void)stopNow {
    LocallyStopped = YES;
    [@"Stopped locally; independent owner review required.\n" writeToFile:@"/var/mobile/Library/DeviceBridge/STOP" atomically:YES encoding:NSUTF8StringEncoding error:nil];
    Indicator.hidden = YES;
    // Deliberately no model-accessible resume. Owner must revoke/review before
    // a controlled UI-component reload; SSH cancellation still works immediately.
}
@end

static void UpdateIndicator(void) {
    dispatch_async(dispatch_get_main_queue(), ^{
        if (!Indicator) {
            Indicator = [[UIWindow alloc] initWithFrame:CGRectMake(0, 0, UIScreen.mainScreen.bounds.size.width, 28)];
            Indicator.windowLevel = UIWindowLevelAlert + 100;
            Indicator.rootViewController = [BridgeIndicatorController new];
        }
        NSData *data = [NSData dataWithContentsOfFile:@"/var/db/device-bridge/lease.json"];
        NSDictionary *lease = data ? [NSJSONSerialization JSONObjectWithData:data options:0 error:nil] : nil;
        NSDictionary *state = State();
        BOOL active = !LocallyStopped && [lease[@"enabled"] isEqual:@YES] && [lease[@"expires"] doubleValue] > Now() && [state[@"app"] isEqual:Fixture];
        Indicator.frame = CGRectMake(0, 0, UIScreen.mainScreen.bounds.size.width, 28);
        Indicator.hidden = !active;
    });
}

static NSDictionary *Observe(NSDictionary *request) {
    double deadline = [request[@"deadline"] doubleValue];
    if (!Allowed(request)) return Error(@"PERMISSION_DENIED");
    NSDictionary *before = State();
    if (!Unlocked(before)) return Error(@"DEVICE_LOCKED");
    if (![before[@"app"] isEqual:Fixture]) return Error(@"PERMISSION_DENIED");
    __block NSDictionary *payload = nil;
    dispatch_semaphore_t done = dispatch_semaphore_create(0);
    [[AccessibilityManager sharedInstance] getCompactUIElementsWithMaxElements:256 visibleOnly:YES clickableOnly:NO completion:^(NSDictionary *result, NSString *error) {
        payload = result;
        dispatch_semaphore_signal(done);
    }];
    if (dispatch_semaphore_wait(done, dispatch_time(DISPATCH_TIME_NOW, (int64_t)(MAX(0, MIN(8, deadline - Now())) * NSEC_PER_SEC))))
        return Error(@"RECOVERY_REQUIRED");
    if (!payload) return Error(@"UNSUPPORTED_CAPABILITY");
    // Use raw native image rather than upstream point-sized JPEG re-encoding.
    __block UIImage *image = nil;
    __block NSData *png = nil;
    dispatch_sync(dispatch_get_main_queue(), ^{
        if (Now() < deadline && Allowed(request) && [State()[@"app"] isEqual:Fixture]) {
            image = [[ScreenManager sharedInstance] captureScreenImage];
            if (image) png = UIImagePNGRepresentation(image);
        }
    });
    NSDictionary *after = State();
    if (!Unlocked(after) || ![after[@"app"] isEqual:Fixture]) return Error(@"STALE_OBSERVATION");
    NSArray *raw = [payload[@"elements"] isKindOfClass:NSArray.class] ? payload[@"elements"] : nil;
    if (!raw) return Error(@"UNSUPPORTED_CAPABILITY");
    NSMutableArray *elements = [NSMutableArray array];
    for (NSDictionary *element in raw) {
        if (![element isKindOfClass:NSDictionary.class]) continue;
        NSMutableDictionary *safe = [NSMutableDictionary dictionary];
        for (NSString *key in @[@"text", @"type", @"rect", @"visible_rect", @"clickable"])
            if (element[key]) safe[key] = element[key];
        [elements addObject:safe];
    }
    NSMutableDictionary *result = [before mutableCopy];
    [result removeObjectForKey:@"screen_on"];
    result[@"elements"] = elements;
    result[@"captured_at"] = @(Now());
    result[@"consistent"] = @([before isEqual:after] && Now() < deadline);
    result[@"atomic"] = @NO;
    result[@"limitations"] = @[@"Foreground/lock/screen sampled before and after; transitions away and back may escape detection.", @"Compact AX bounds have integer precision; identifiers and native AX actions are unavailable in this adapter.", @"Safe-area and keyboard occlusion are not independently measured."];
    if (png.length > 0 && png.length < 12 * 1024 * 1024) {
        size_t width = CGImageGetWidth(image.CGImage), height = CGImageGetHeight(image.CGImage);
        result[@"image"] = @{@"mimeType": @"image/png", @"data": [png base64EncodedStringWithOptions:0],
                               @"width": @(width), @"height": @(height),
                               @"transform": @{@"xScale": @([before[@"screen"][@"width"] doubleValue] / width),
                                                @"yScale": @([before[@"screen"][@"height"] doubleValue] / height),
                                                @"xOffset": @0, @"yOffset": @0, @"calibrated": @NO}};
    } else result[@"screenshot_status"] = @"unavailable";
    return result;
}

static NSDictionary *BridgeHandleRequest(NSDictionary *request, int client) {
    double deadline = [request[@"deadline"] doubleValue];
    if (!isfinite(deadline) || deadline <= Now() || deadline > Now() + 30) return Error(@"DEADLINE_EXCEEDED");
    if (Poisoned || LocallyStopped) return Error(@"RECOVERY_REQUIRED");
    UpdateIndicator();
    NSString *op = request[@"op"];
    if (!Allowed(request)) return Error(@"PERMISSION_DENIED");
    if ([op isEqual:@"observe"]) return Observe(request);
    if (![op isEqual:@"act"]) return Error(@"UNSUPPORTED_CAPABILITY");
    NSDictionary *action = request[@"action"];
    if (![action isKindOfClass:NSDictionary.class]) return Error(@"PERMISSION_DENIED");
    NSDictionary *state = State();
    if (!Unlocked(state)) return Error(@"DEVICE_LOCKED");
    NSString *kind = action[@"kind"];
    if ([kind isEqual:@"launch"]) {
        // Fixture-only activation, including from SpringBoard. Never wake/unlock.
        if (![@[Fixture, @"com.apple.springboard"] containsObject:state[@"app"]]) return Error(@"PERMISSION_DENIED");
        if (Now() >= deadline || !Allowed(request) || !BridgeClientConnected(client)) return Error(@"DEADLINE_EXCEEDED");
        // Same LaunchServices mechanism as pinned ios-mcp AppManager, restricted
        // to the fixture. No shell/package manager or synchronous UI fallback.
        Class workspaceClass = objc_getClass("LSApplicationWorkspace");
        SEL shared = NSSelectorFromString(@"defaultWorkspace");
        SEL open = NSSelectorFromString(@"openApplicationWithBundleID:");
        if (!workspaceClass || ![workspaceClass respondsToSelector:shared]) return Error(@"UNSUPPORTED_CAPABILITY");
        id workspace = ((id (*)(id, SEL))objc_msgSend)((id)workspaceClass, shared);
        if (!workspace || ![workspace respondsToSelector:open]) return Error(@"UNSUPPORTED_CAPABILITY");
        if (!((BOOL (*)(id, SEL, NSString *))objc_msgSend)(workspace, open, Fixture)) return Error(@"RECOVERY_REQUIRED");
        return @{@"status": @"dispatched"};
    }
    if (![state[@"app"] isEqual:Fixture] || ![request[@"expected"] isKindOfClass:NSDictionary.class] || !Matches(state, request[@"expected"])) return Error(@"STALE_OBSERVATION");
    if ([kind isEqual:@"insert_text"]) {
        NSString *text = action[@"text"];
        if (![text isKindOfClass:NSString.class] || text.length == 0 || text.length > 64 || [text rangeOfCharacterFromSet:NSCharacterSet.controlCharacterSet].location != NSNotFound) return Error(@"PERMISSION_DENIED");
        if (Now() >= deadline || !Allowed(request) || !BridgeClientConnected(client)) return Error(@"DEADLINE_EXCEEDED");
        NSString *error = nil;
        if (![[TextInputManager sharedInstance] sendTextUsingUnicodeHID:text delayMs:0 characterByCharacter:NO error:&error]) {
            Poisoned = YES; // A partial dispatch is never automatically retried.
            return Error(@"RECOVERY_REQUIRED");
        }
        return @{@"status": @"dispatched"};
    }
    if ([kind isEqual:@"tap_element"]) {
        double x = [action[@"x"] doubleValue], y = [action[@"y"] doubleValue];
        if (!isfinite(x) || !isfinite(y) || x < 0 || y < 0 || x >= [state[@"screen"][@"width"] doubleValue] || y >= [state[@"screen"][@"height"] doubleValue]) return Error(@"PERMISSION_DENIED");
        __block BOOL success = NO;
        dispatch_sync(dispatch_get_main_queue(), ^{
            if (Now() >= deadline || !Allowed(request) || !BridgeClientConnected(client) || !Matches(State(), request[@"expected"])) return;
            CGPoint point = CGPointMake(x, y);
            // Synchronous contact pair: no sleeping/queued gesture that survives cancellation.
            @try {
                NSString *error = nil;
                success = [[IOSMCPHIDManager sharedInstance] performTapSequenceAtPoint:point error:&error];
            } @finally {
                [[IOSMCPHIDManager sharedInstance] sendTouchAtPoint:point phase:TouchPhaseEnded];
            }
        });
        return success ? @{@"status": @"dispatched"} : Error(@"STALE_OBSERVATION");
    }
    return Error(@"UNSUPPORTED_CAPABILITY");
}

static BOOL Transfer(int fd, void *buffer, size_t length, BOOL writing) {
    size_t offset = 0;
    while (offset < length) {
        ssize_t n = writing ? write(fd, (char *)buffer + offset, length - offset) : read(fd, (char *)buffer + offset, length - offset);
        if (n <= 0) return NO;
        offset += (size_t)n;
    }
    return YES;
}

__attribute__((constructor)) static void Start(void) {
    if (![NSBundle.mainBundle.bundleIdentifier isEqual:@"com.apple.springboard"]) return;
    Epoch = NSUUID.UUID.UUIDString;
    LocallyStopped = [NSFileManager.defaultManager fileExistsAtPath:@"/var/mobile/Library/DeviceBridge/STOP"];
    dispatch_async(dispatch_get_main_queue(), ^{
        [NSTimer scheduledTimerWithTimeInterval:1 repeats:YES block:^(NSTimer *timer) { UpdateIndicator(); }];
    });
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
        @autoreleasepool {
            NSString *parent = SocketPath.stringByDeletingLastPathComponent;
            mkdir(parent.fileSystemRepresentation, 0700);
            struct stat info;
            if (lstat(parent.fileSystemRepresentation, &info) || !S_ISDIR(info.st_mode) || info.st_uid != getuid() || (info.st_mode & 0077)) return;
            int fd = socket(AF_UNIX, SOCK_STREAM, 0);
            if (fd < 0) return;
            int noSigPipe = 1;
            setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &noSigPipe, sizeof(noSigPipe));
            struct sockaddr_un address = {0};
            address.sun_family = AF_UNIX;
            strlcpy(address.sun_path, SocketPath.fileSystemRepresentation, sizeof(address.sun_path));
            // Only remove a stale socket, never an arbitrary path.
            if (!lstat(address.sun_path, &info)) {
                if (!S_ISSOCK(info.st_mode) || info.st_uid != getuid()) { close(fd); return; }
                unlink(address.sun_path);
            }
            if (bind(fd, (struct sockaddr *)&address, sizeof(address)) || chmod(address.sun_path, 0600) || listen(fd, 4)) { close(fd); return; }
            for (;;) {
                int client = accept(fd, NULL, NULL);
                if (client < 0) break;
                @autoreleasepool {
                    uid_t uid; gid_t gid;
                    struct timeval timeout = {12, 0};
                    setsockopt(client, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));
                    setsockopt(client, SOL_SOCKET, SO_SNDTIMEO, &timeout, sizeof(timeout));
                    setsockopt(client, SOL_SOCKET, SO_NOSIGPIPE, &noSigPipe, sizeof(noSigPipe));
                    if (getpeereid(client, &uid, &gid) || uid != 0) { close(client); continue; }
                    uint32_t length;
                    if (!Transfer(client, &length, 4, NO)) { close(client); continue; }
                    length = ntohl(length);
                    if (length == 0 || length > 262144) { close(client); continue; }
                    NSMutableData *data = [NSMutableData dataWithLength:length];
                    if (!Transfer(client, data.mutableBytes, length, NO)) { close(client); continue; }
                    NSDictionary *request = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
                    NSDictionary *result = nil;
                    @try { result = [request isKindOfClass:NSDictionary.class] ? BridgeHandleRequest(request, client) : Error(@"PERMISSION_DENIED"); }
                    @catch (NSException *exception) { Poisoned = YES; result = Error(@"RECOVERY_REQUIRED"); }
                    NSData *reply = [NSJSONSerialization dataWithJSONObject:result options:0 error:nil];
                    uint32_t size = htonl((uint32_t)reply.length);
                    if (reply && Transfer(client, &size, 4, YES)) Transfer(client, (void *)reply.bytes, reply.length, YES);
                    close(client);
                }
            }
            close(fd);
        }
    });
}
