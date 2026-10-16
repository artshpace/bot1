import type { ReactNode } from "react";
import { useAccount } from "../lib/account";
import { Card, P, Screen, Section } from "./ui";

/** Пускает в редактор только администратора и руководителя. */
export function AdminOnly({ children }: { children: ReactNode }) {
  const { profile } = useAccount();
  if (profile?.role === "admin" || profile?.role === "director") return <>{children}</>;
  return (
    <Screen>
      <Section style={{ paddingTop: 0 }}>
        <Card><P>Редактор курсов доступен только администратору и руководителю студии. Войдите в кабинет под таким аккаунтом.</P></Card>
      </Section>
    </Screen>
  );
}
