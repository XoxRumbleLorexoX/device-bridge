ARCHS = arm64 arm64e
TARGET = iphone:clang:latest:15.0
include $(THEOS)/makefiles/common.mk
APPLICATION_NAME = BridgeFixture
BridgeFixture_BUNDLEID = dev.devicebridge.fixture
BridgeFixture_FILES = main.m
BridgeFixture_CFLAGS = -fobjc-arc
BridgeFixture_FRAMEWORKS = UIKit Foundation
BridgeFixture_RESOURCE_FILES = Info.plist
include $(THEOS_MAKE_PATH)/application.mk
