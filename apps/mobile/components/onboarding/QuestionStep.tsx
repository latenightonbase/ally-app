import React, { useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput as RNTextInput,
} from "react-native";
import { MotiView } from "moti";
import { Chip } from "../ui/Chip";
import { Button } from "../ui/Button";
import { useTheme } from "../../context/ThemeContext";

interface QuestionStepProps {
  stepIndex: number;
  title: string;
  subtitle?: string;
  type: "text" | "multiline" | "chips" | "choice" | "promise";
  placeholder?: string;

  // For text/multiline
  value?: string;
  onChangeText?: (text: string) => void;

  // For chips (multi-select)
  options?: string[];
  selectedOptions?: string[];
  onToggleOption?: (option: string) => void;

  // For choice (single-select)
  choices?: { label: string; value: string }[];
  selectedChoice?: string;
  onSelectChoice?: (value: string) => void;

  canContinue: boolean;
  onNext: () => void;
  buttonTitle?: string;
  showButton?: boolean;
}

export function QuestionStep({
  stepIndex,
  title,
  subtitle,
  type,
  placeholder,
  value = "",
  onChangeText,
  options = [],
  selectedOptions = [],
  onToggleOption,
  choices = [],
  selectedChoice,
  onSelectChoice,
  canContinue,
  onNext,
  buttonTitle = "Continue",
  showButton = true,
}: QuestionStepProps) {
  const { theme } = useTheme();
  const inputRef = useRef<RNTextInput>(null);

  useEffect(() => {
    if (type === "text" || type === "multiline") {
      const timer = setTimeout(() => inputRef.current?.focus(), 400);
      return () => clearTimeout(timer);
    }
  }, [type]);

  return (
    <View className="flex-1 justify-center px-8" key={`step-${stepIndex}`}>
      {/* Question text */}
      <MotiView
        from={{ opacity: 0, translateY: 14 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: "timing", duration: 500 }}
      >
        <Text className="text-foreground text-2xl font-sans-bold mb-2 leading-9">
          {title}
        </Text>
        {subtitle && (
          <Text className="text-muted text-base font-sans mb-8 leading-6">
            {subtitle}
          </Text>
        )}
        {!subtitle && <View className="h-6" />}
      </MotiView>

      {/* Input area */}
      <MotiView
        from={{ opacity: 0, translateY: 10 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{
          type: "timing",
          duration: 450,
          delay: 150,
        }}
      >
        {type === "promise" && null}

        {(type === "text" || type === "multiline") && (
          <RNTextInput
            ref={inputRef}
            placeholder={placeholder}
            placeholderTextColor={theme.colors["--color-muted"]}
            value={value}
            onChangeText={onChangeText}
            multiline={type === "multiline"}
            numberOfLines={type === "multiline" ? 4 : 1}
            returnKeyType={type === "text" ? "done" : undefined}
            onSubmitEditing={
              type === "text" && canContinue ? onNext : undefined
            }
            selectionColor={theme.preview.primary}
            cursorColor={theme.preview.primary}
            style={[
              {
                fontSize: 22,
                fontWeight: "700",
                color: theme.preview.primary,
                backgroundColor: "transparent",
                borderWidth: 0,
                paddingVertical: 8,
                paddingHorizontal: 0,
              },
              type === "multiline"
                ? {
                    minHeight: 120,
                    textAlignVertical: "top",
                    lineHeight: 32,
                  }
                : undefined,
            ]}
          />
        )}

        {type === "chips" && (
          <View className="flex-row flex-wrap">
            {options.map((option) => (
              <Chip
                key={option}
                label={option}
                selected={selectedOptions.includes(option)}
                onPress={() => onToggleOption?.(option)}
              />
            ))}
          </View>
        )}

        {type === "choice" && (
          <View className="gap-3">
            {choices.map((choice) => (
              <Button
                key={choice.value}
                title={choice.label}
                variant={
                  selectedChoice === choice.value ? "primary" : "secondary"
                }
                onPress={() => onSelectChoice?.(choice.value)}
              />
            ))}
          </View>
        )}
      </MotiView>

      {/* Continue button */}
      {showButton && (
        <MotiView
          from={{ opacity: 0, translateY: 10 }}
          animate={{ opacity: canContinue ? 1 : 0.4, translateY: 0 }}
          transition={{
            type: "timing",
            duration: 400,
            delay: 300,
          }}
          className="mt-12"
        >
          <Button
            title={buttonTitle}
            onPress={onNext}
            disabled={!canContinue}
            size="lg"
          />
        </MotiView>
      )}
    </View>
  );
}
