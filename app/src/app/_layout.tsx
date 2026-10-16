import { useEffect } from "react";
import { SplashScreen, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
// по одному файлу на начертание — так в приложение не попадают все остальные шрифты семейства
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold";
import { PlayfairDisplay_700Bold } from "@expo-google-fonts/playfair-display/700Bold";
import { PlayfairDisplay_800ExtraBold } from "@expo-google-fonts/playfair-display/800ExtraBold";
import { ProgressProvider } from "../lib/progress";
import { AccountProvider } from "../lib/account";
import { CoursesProvider } from "../lib/courses";
import { SchoolSync } from "../components/SchoolSync";
import { AwardModal } from "../components/AwardModal";
import { XpToast } from "../components/XpToast";
import { RemindersSync } from "../components/ScheduleBlocks";
import { GameSync } from "../components/GameSync";
import { C } from "../theme";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
    PlayfairDisplay_700Bold, PlayfairDisplay_800ExtraBold,
  });

  useEffect(() => { if (loaded || error) SplashScreen.hideAsync(); }, [loaded, error]);
  if (!loaded && !error) return null;

  return (
    <SafeAreaProvider>
      <ProgressProvider>
        <AccountProvider>
          <CoursesProvider>
            <SchoolSync />
            <RemindersSync />
            <GameSync />
            <StatusBar style="dark" />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg }, animation: "slide_from_right" }} />
            <XpToast />
            <AwardModal />
          </CoursesProvider>
        </AccountProvider>
      </ProgressProvider>
    </SafeAreaProvider>
  );
}
