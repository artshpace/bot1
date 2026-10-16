import { Tabs } from "expo-router";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "../../components/Icon";
import { C, F } from "../../theme";

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.red,
        tabBarInactiveTintColor: C.hint,
        tabBarLabelStyle: { fontFamily: F.semi, fontSize: 10.5 },
        tabBarStyle: { height: 64 + insets.bottom, paddingTop: 6, borderTopColor: C.hair, backgroundColor: C.bg },
        sceneStyle: { backgroundColor: C.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Главная", tabBarIcon: ({ color }) => <Icon name="home" color={color as string} /> }} />
      <Tabs.Screen name="schedule" options={{ title: "Расписание", tabBarIcon: ({ color }) => <Icon name="cal" color={color as string} /> }} />
      <Tabs.Screen
        name="book"
        options={{
          title: "Записаться",
          tabBarIcon: () => (
            <View style={s.bump}><Icon name="plus" color="#fff" strokeWidth={2.2} /></View>
          ),
        }}
      />
      <Tabs.Screen name="learn" options={{ title: "Обучение", tabBarIcon: ({ color }) => <Icon name="laptop" color={color as string} /> }} />
      <Tabs.Screen name="profile" options={{ title: "Профиль", tabBarIcon: ({ color }) => <Icon name="trophy" color={color as string} /> }} />
    </Tabs>
  );
}

const s = StyleSheet.create({
  bump: {
    width: 46, height: 46, borderRadius: 23, backgroundColor: C.red, alignItems: "center", justifyContent: "center",
    marginTop: -18, borderWidth: 3, borderColor: C.bg,
    shadowColor: C.red, shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 5,
  },
});
