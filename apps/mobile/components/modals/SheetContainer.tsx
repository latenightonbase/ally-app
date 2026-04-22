import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { View, Text, Pressable, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetModal,
  BottomSheetBackdrop,
  BottomSheetScrollView,
  BottomSheetFooter,
  BottomSheetTextInput,
  type BottomSheetBackdropProps,
  type BottomSheetFooterProps,
} from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../context/ThemeContext";

interface SheetContainerProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export { BottomSheetTextInput as SheetTextInput };

export function SheetContainer({
  visible,
  title,
  onClose,
  children,
  footer,
}: SheetContainerProps) {
  const { theme, themeVars } = useTheme();
  const sheetRef = useRef<BottomSheetModal>(null);
  const insets = useSafeAreaInsets();

  const snapPoints = useMemo(() => ["88%"], []);

  useEffect(() => {
    if (visible) {
      sheetRef.current?.present();
    } else {
      sheetRef.current?.dismiss();
    }
  }, [visible]);

  const handleDismiss = useCallback(() => {
    onClose();
  }, [onClose]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
        opacity={0.55}
      />
    ),
    []
  );

  const footerHeight = footer ? 72 + insets.bottom : 0;

  const renderFooter = useCallback(
    (props: BottomSheetFooterProps) => {
      if (!footer) return null;
      return (
        <BottomSheetFooter {...props} bottomInset={0}>
          <View
            style={[
              themeVars,
              {
                paddingHorizontal: 20,
                paddingTop: 10,
                paddingBottom: Math.max(insets.bottom, 16),
                backgroundColor: theme.colors["--color-background"],
                borderTopWidth: 1,
                borderTopColor: theme.colors["--color-border"],
              },
            ]}
          >
            {footer}
          </View>
        </BottomSheetFooter>
      );
    },
    [footer, insets.bottom, theme.colors, themeVars]
  );

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={snapPoints}
      enableDynamicSizing={false}
      enablePanDownToClose
      keyboardBehavior={Platform.OS === "ios" ? "interactive" : "interactive"}
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      backdropComponent={renderBackdrop}
      footerComponent={footer ? renderFooter : undefined}
      handleIndicatorStyle={{
        backgroundColor: theme.colors["--color-border"],
        width: 40,
      }}
      backgroundStyle={{
        backgroundColor: theme.colors["--color-background"],
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
      }}
      onDismiss={handleDismiss}
    >
      <View style={[{ flex: 1 }, themeVars]}>
      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 4,
          paddingBottom: 12,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text
          style={{ color: theme.colors["--color-foreground"] }}
          className="text-xl font-sans-bold flex-1"
        >
          {title}
        </Text>
        <Pressable
          onPress={onClose}
          hitSlop={10}
          className="active:opacity-70"
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: theme.colors["--color-surface"],
            borderWidth: 1,
            borderColor: theme.colors["--color-border"],
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons
            name="close"
            size={16}
            color={theme.colors["--color-muted"]}
          />
        </Pressable>
      </View>

      <BottomSheetScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: footerHeight + 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </BottomSheetScrollView>
      </View>
    </BottomSheetModal>
  );
}
