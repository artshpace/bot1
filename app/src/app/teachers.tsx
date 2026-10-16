import { TeacherCard } from "../components/TeacherCard";
import { Label, Screen, Section } from "../components/ui";
import { TEACHERS } from "../lib/teachers";

export default function Teachers() {
  return (
    <Screen>
      <Section style={{ paddingTop: 0 }}>
        <Label icon="person">Преподаватели</Label>
        {TEACHERS.map((t) => <TeacherCard key={t.name} t={t} />)}
      </Section>
    </Screen>
  );
}
