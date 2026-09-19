#import "MCPLogger.h"
@implementation MCPLogger
+ (BOOL)isDebugLoggingEnabled { return NO; }
+ (NSString *)logDirectoryPath { return nil; }
+ (NSString *)logFilePath { return nil; }
+ (NSString *)previousLogFilePath { return nil; }
+ (NSArray *)allLogFilePaths { return @[]; }
+ (NSString *)lastLogError { return nil; }
+ (void)log:(NSString *)format, ... {}
+ (void)logMessage:(NSString *)message {}
+ (BOOL)clearLogsWithError:(NSError **)error { return YES; }
@end
