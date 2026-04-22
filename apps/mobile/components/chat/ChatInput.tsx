import React, { useState, useCallback, useEffect, useRef } from "react";
import { View, TextInput, Pressable, Animated } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { useTheme } from "../../context/ThemeContext";

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled = false }: ChatInputProps) {
  const [text, setText] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [micAvailable, setMicAvailable] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const { theme } = useTheme();

  useEffect(() => {
    ExpoSpeechRecognitionModule.getStateAsync()
      .then(() => setMicAvailable(true))
      .catch(() => setMicAvailable(false));
  }, []);

  useEffect(() => {
    if (isListening) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ]),
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [isListening]);

  useSpeechRecognitionEvent("result", (event) => {
    const transcript = event.results[0]?.transcript ?? "";
    if (transcript) {
      setText(transcript);
    }
    if (event.isFinal) {
      setIsListening(false);
    }
  });

  useSpeechRecognitionEvent("error", () => {
    setIsListening(false);
  });

  useSpeechRecognitionEvent("end", () => {
    setIsListening(false);
  });

  const handleMicPress = useCallback(async () => {
    if (isListening) {
      ExpoSpeechRecognitionModule.stop();
      setIsListening(false);
      return;
    }

    const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!result.granted) return;

    ExpoSpeechRecognitionModule.start({
      lang: "en-US",
      interimResults: true,
      maxAlternatives: 1,
    });
    setIsListening(true);
  }, [isListening]);

  const handleSend = () => {
    if (text.trim().length === 0 || disabled) return;
    if (isListening) {
      ExpoSpeechRecognitionModule.stop();
      setIsListening(false);
    }
    onSend(text.trim());
    setText("");
  };

  const canSend = text.trim().length > 0 && !disabled;
  const showMic = micAvailable && text.trim().length === 0;

  return (
    <View
      className="flex-row items-end px-4 py-3"
      style={{
        backgroundColor: theme.colors["--color-background"],
        borderTopWidth: 1,
        borderTopColor: theme.colors["--color-border"],
      }}
    >
      <View
        className="flex-1 mr-3 flex-row items-end"
        style={{
          backgroundColor: theme.colors["--color-surface"],
          borderRadius: 24,
          paddingHorizontal: 18,
          paddingVertical: 10,
          borderWidth: 1,
          borderColor: theme.colors["--color-border"],
        }}
      >
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={isListening ? "Listening..." : "Message Anzi..."}
          placeholderTextColor={
            isListening
              ? theme.colors["--color-primary"]
              : theme.colors["--color-faint"]
          }
          multiline
          maxLength={500}
          style={{
            maxHeight: 100,
            color: theme.colors["--color-foreground"],
            fontSize: 15,
            paddingTop: 4,
            paddingBottom: 4,
          }}
          className="flex-1 font-sans"
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
        />
      </View>

      {showMic ? (
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <Pressable
            onPress={handleMicPress}
            disabled={disabled}
            style={{
              width: 46,
              height: 46,
              borderRadius: 23,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: isListening
                ? theme.colors["--color-primary"]
                : theme.colors["--color-primary-soft"],
              shadowColor: isListening
                ? theme.colors["--color-primary"]
                : "transparent",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 10,
              elevation: isListening ? 4 : 0,
            }}
          >
            <Ionicons
              name={isListening ? "mic" : "mic-outline"}
              size={20}
              color={
                isListening ? "#ffffff" : theme.colors["--color-primary"]
              }
            />
          </Pressable>
        </Animated.View>
      ) : (
        <Pressable
          onPress={handleSend}
          disabled={!canSend}
          style={{
            width: 46,
            height: 46,
            borderRadius: 23,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: canSend
              ? theme.colors["--color-primary"]
              : theme.colors["--color-primary-soft"],
            shadowColor: canSend
              ? theme.colors["--color-primary"]
              : "transparent",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 10,
            elevation: canSend ? 4 : 0,
          }}
        >
          <Ionicons
            name="send"
            size={18}
            color={canSend ? "#ffffff" : theme.colors["--color-primary"]}
          />
        </Pressable>
      )}
    </View>
  );
}
