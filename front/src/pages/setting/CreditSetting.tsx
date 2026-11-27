import { AUTHOR, CONTRIBUTORS, type CreditPerson, SPONSORS, THIRD_PARTY } from "@/pages/setting/credits";
import { SettingCard, SettingPanel } from "@/pages/setting/SettingPanel";

function People({ people, empty }: { people: CreditPerson[]; empty: string }) {
  if (people.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <ul className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
      {people.map((person) => (
        <li key={person.name} className="min-w-0">
          <span className="font-medium">{person.name}</span>
          {person.note && <span className="ml-2 text-xs text-muted-foreground">{person.note}</span>}
        </li>
      ))}
    </ul>
  );
}

// クレジット（FN0903-BR05）。作った人・協力してくれた人・支援してくれた人と、使っている部品のライセンス
export function CreditSetting() {
  return (
    <SettingPanel
      title="クレジット"
      description="ari-docs は個人が開発している無料のソフトウェアです。支えてくださっている皆さんに感謝します"
      plain
    >
      <SettingCard title="作成者">
        <People people={[AUTHOR]} empty="" />
      </SettingCard>
      <SettingCard title="コントリビューター" description="不具合の報告・アイデア・試用などで協力してくれた方">
        <People people={CONTRIBUTORS} empty="まだいません。不具合の報告やアイデアをお待ちしています" />
      </SettingCard>
      <SettingCard title="スポンサー" description="開発を支援してくれた方・会社">
        <People people={SPONSORS} empty="まだいません" />
      </SettingCard>
      <SettingCard
        title="使っているソフトウェア"
        description="主なものです。すべての著作権とライセンスの全文は、アプリと同じフォルダの THIRD_PARTY_NOTICES.txt にあります"
      >
        <dl className="divide-y divide-border text-sm">
          {THIRD_PARTY.map((item) => (
            <div key={item.name} className="flex gap-4 py-2 first:pt-0 last:pb-0">
              <dt className="min-w-0 flex-1">{item.name}</dt>
              <dd className="shrink-0 text-muted-foreground">{item.license}</dd>
            </div>
          ))}
        </dl>
      </SettingCard>
      <p className="text-xs text-muted-foreground">© 2026 {AUTHOR.name}</p>
    </SettingPanel>
  );
}
