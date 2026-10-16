import { useState } from "react";
import { Text } from "react-native";
import { router } from "expo-router";
import { Card, Field, Hint, Input, Label, P, PrimaryButton, RowLink, Screen, Section } from "../components/ui";
import { useAccount } from "../lib/account";
import { openLink } from "../lib/links";
import { SITE_URL } from "../config";
import { C, F } from "../theme";

export default function Login() {
  const { signIn } = useAccount();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!login.trim() || !password) { setError("Введите логин и пароль."); return; }
    setBusy(true); setError(null);
    try {
      await signIn(login, password);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось войти.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Section style={{ paddingTop: 0 }}>
        <Label icon="person">Вход в личный кабинет</Label>
        <Card>
          <P>Тот же аккаунт, что на сайте artshpace.kz. После входа здесь появятся посещаемость, навыки и оценки педагогов — ваши или вашего ребёнка.</P>
        </Card>
        <Field label="Email или ФИО">
          <Input value={login} onChangeText={setLogin} placeholder="name@mail.ru или Иванов Иван" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="username" />
        </Field>
        <Field label="Пароль">
          <Input value={password} onChangeText={setPassword} placeholder="Пароль" secureTextEntry textContentType="password" onSubmitEditing={submit} />
        </Field>
        {error && <Text style={{ color: C.red, fontFamily: F.semi, fontSize: 13.5, marginBottom: 8 }}>{error}</Text>}
        <PrimaryButton title={busy ? "Входим…" : "Войти"} disabled={busy} onPress={submit} />
        <Hint center style={{ marginTop: 12, marginBottom: 18 }}>Аккаунт ученика или родителя привязывает к журналу администратор студии.</Hint>
        <RowLink icon="plus" title="Нет аккаунта? Регистрация на сайте" onPress={() => openLink(SITE_URL + "account/register.html")} />
        <RowLink icon="help" title="Забыли пароль?" onPress={() => openLink(SITE_URL + "account/recover.html")} />
      </Section>
    </Screen>
  );
}
