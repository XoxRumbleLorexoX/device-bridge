#import <UIKit/UIKit.h>

@interface FixtureController : UIViewController <UITextFieldDelegate>
@property UILabel *result;
@property UITextField *input;
@property NSUInteger count;
@end
@implementation FixtureController
- (void)viewDidLoad {
    [super viewDidLoad];
    self.view.backgroundColor = UIColor.whiteColor;
    UILabel *title = [[UILabel alloc] initWithFrame:CGRectMake(20, 60, 340, 60)];
    title.text = @"Device Bridge • supervised test";
    title.textColor = UIColor.systemRedColor;
    title.numberOfLines = 2;
    [self.view addSubview:title];
    self.result = [[UILabel alloc] initWithFrame:CGRectMake(20, 200, 340, 70)];
    self.result.text = @"Ready";
    self.result.numberOfLines = 3;
    self.result.isAccessibilityElement = YES;
    [self.view addSubview:self.result];
    self.input = [[UITextField alloc] initWithFrame:CGRectMake(20, 130, 300, 48)];
    self.input.placeholder = @"Test input";
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
    }
    UILabel *note = [[UILabel alloc] initWithFrame:CGRectMake(20, 360, 340, 100)];
    note.text = @"No network, accounts, saved data, or submission. Leave this app to stop further fixture input. Use owner stop to revoke control.";
    note.numberOfLines = 5;
    [self.view addSubview:note];
}
- (void)changed { self.result.text = self.input.text; self.result.accessibilityLabel = self.input.text; }
- (void)tapped:(UIButton *)sender {
    self.count++;
    self.result.text = [NSString stringWithFormat:@"Target %ld: %lu", (long)sender.tag, (unsigned long)self.count];
    self.result.accessibilityLabel = self.result.text;
}
- (BOOL)textFieldShouldReturn:(UITextField *)field { self.result.text = @"UNEXPECTED RETURN"; return NO; }
- (UIInterfaceOrientationMask)supportedInterfaceOrientations { return UIInterfaceOrientationMaskAll; }
@end
@interface FixtureApp : UIResponder <UIApplicationDelegate>
@property UIWindow *window;
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
