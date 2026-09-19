# Standalone fixture candidate: isolate the early runtime crash from arm64e.
ARCHS = arm64
TARGET = iphone:clang:latest:15.0
include $(THEOS)/makefiles/common.mk
APPLICATION_NAME = BridgeFixture
BridgeFixture_BUNDLEID = dev.devicebridge.fixture
BridgeFixture_FILES = main.m
BridgeFixture_CFLAGS = -fobjc-arc
BridgeFixture_FRAMEWORKS = UIKit Foundation
BridgeFixture_RESOURCE_FILES = Info.plist ../LICENSE Resources/AppIcon60.png Resources/AppIcon60@2x.png Resources/AppIcon60@3x.png
include $(THEOS_MAKE_PATH)/application.mk
