# Generated source tree only. THEOS and scheme must be supplied explicitly.
ARCHS = arm64 arm64e
TARGET = iphone:clang:latest:15.0
include $(THEOS)/makefiles/common.mk
TWEAK_NAME = DeviceBridgeUI
DeviceBridgeUI_FILES = BridgeUI.m QuietLogger.m ScreenManager.m AppManager.m MCPProcessUtil.m AccessibilityManager.m HIDManager.m TextInputManager.m MCPAXQueryContext.m MCPAXRemoteContextResolver.m MCPUIElementSerializer.m MCPUIElementsFacade.m MCPAXAttributeBridge.m MCPAXNodeSource.m
DeviceBridgeUI_CFLAGS = -fobjc-arc -Wno-deprecated-declarations
DeviceBridgeUI_FRAMEWORKS = Foundation UIKit IOKit CoreGraphics QuartzCore Security
ifeq ($(THEOS_PACKAGE_SCHEME),rootless)
DeviceBridgeUI_CFLAGS += -DMCP_ROOTLESS=1
endif
include $(THEOS_MAKE_PATH)/tweak.mk
# No install/respring hooks, installer helpers, AppSync, or ldid binaries bundled.

after-stage::
	@mkdir -p "$(THEOS_STAGING_DIR)$(THEOS_PACKAGE_INSTALL_PREFIX)/usr/share/doc/device-bridge"
	@cp LICENSE NOTICE THIRD_PARTY_NOTICES.md "$(THEOS_STAGING_DIR)$(THEOS_PACKAGE_INSTALL_PREFIX)/usr/share/doc/device-bridge/"
