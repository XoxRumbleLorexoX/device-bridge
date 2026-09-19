#import <UIKit/UIKit.h>

@interface FixtureController : UIViewController <UITextFieldDelegate>
@property UILabel *result;
@property UITextField *input;
@property NSUInteger count;
@end
@implementation FixtureController
- (void)viewDidLoad {
    [super viewDidLoad];
    self.view.backgroundColor = UIColor.systemBackgroundColor;
    UILabel *title = [[UILabel alloc] initWithFrame:CGRectMake(20, 60, 340, 60)];
    title.text = @"Device Bridge • supervised test";
    title.textColor = UIColor.systemRedColor;
    title.numberOfLines = 2;
    [self.view addSubview:title];
    self.result = [[UILabel alloc] initWithFrame:CGRectMake(20, 200, 340, 70)];
    self.result.text = @"Ready — type above or tap a blue square below.";
    self.result.textColor = UIColor.labelColor;
    self.result.accessibilityIdentifier = @"fixture.result";
    self.result.numberOfLines = 3;
    self.result.isAccessibilityElement = YES;
    [self.view addSubview:self.result];
    self.input = [[UITextField alloc] initWithFrame:CGRectMake(20, 130, 300, 48)];
    self.input.placeholder = @"Type here — watch Echo below";
    self.input.textColor = UIColor.labelColor;
    self.input.backgroundColor = UIColor.secondarySystemBackgroundColor;
    self.input.accessibilityIdentifier = @"fixture.input";
    self.input.borderStyle = UITextBorderStyleRoundedRect;
    self.input.autocorrectionType = UITextAutocorrectionTypeNo;
    self.input.autocapitalizationType = UITextAutocapitalizationTypeNone;
    self.input.delegate = self;
    [self.input addTarget:self action:@selector(changed) forControlEvents:UIControlEventEditingChanged];
    [self.view addSubview:self.input];
    // Small known targets; coordinates must be measured in both orientations before claims.
    for (NSUInteger i = 0; i < 3; i++) {
        UIButton *button = [UIButton buttonWithType:UIButtonTypeSystem];
        CGFloat side = 12 + i * 8;
        button.frame = CGRectMake(30 + i * 70, 300, side, side);
        button.backgroundColor = UIColor.systemBlueColor;
        button.accessibilityLabel = [NSString stringWithFormat:@"Target %lu", (unsigned long)i];
        button.accessibilityIdentifier = [NSString stringWithFormat:@"fixture.target.%lu", (unsigned long)i];
        button.tag = i;
        [button addTarget:self action:@selector(tapped:) forControlEvents:UIControlEventTouchUpInside];
        [self.view addSubview:button];
        UILabel *caption = [[UILabel alloc] initWithFrame:CGRectMake(20 + i * 70, 334, 68, 20)];
        caption.text = [NSString stringWithFormat:@"Button %lu", (unsigned long)i + 1];
        caption.font = [UIFont systemFontOfSize:12];
        caption.textColor = UIColor.labelColor;
        [self.view addSubview:caption];
    }
    UILabel *note = [[UILabel alloc] initWithFrame:CGRectMake(20, 360, 340, 100)];
    note.text = @"Tap a blue square: the count changes above. Type: Echo updates without Return. This test app sends and saves nothing.";
    note.textColor = UIColor.secondaryLabelColor;
    note.numberOfLines = 5;
    [self.view addSubview:note];
}
- (void)changed {
    self.result.text = [NSString stringWithFormat:@"Echo: %@", self.input.text ?: @""];
    self.result.accessibilityLabel = self.result.text;
}
- (void)tapped:(UIButton *)sender {
    self.count++;
    self.result.text = [NSString stringWithFormat:@"Button %ld tapped. Total taps: %lu", (long)sender.tag + 1, (unsigned long)self.count];
    self.result.accessibilityLabel = self.result.text;
}
- (BOOL)textFieldShouldReturn:(UITextField *)field { self.result.text = @"UNEXPECTED RETURN"; return NO; }
- (UIInterfaceOrientationMask)supportedInterfaceOrientations { return UIInterfaceOrientationMaskAll; }
@end
@interface FixtureApp : UIResponder <UIApplicationDelegate>
@property (nonatomic, strong) UIWindow *window;
@end
@implementation FixtureApp
- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)options {
    self.window = [[UIWindow alloc] initWithFrame:UIScreen.mainScreen.bounds];
    self.window.rootViewController = [FixtureController new];
    [self.window makeKeyAndVisible];
    return YES;
}
@end
int main(int argc, char **argv) { @autoreleasepool { return UIApplicationMain(argc, argv, nil, NSStringFromClass(FixtureApp.class)); } }
