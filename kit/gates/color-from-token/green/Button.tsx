export function Button({ children }: { children: React.ReactNode }) {
  // Цвет приходит из темы: перекрашивается вместе с ней.
  return <button className="bg-[var(--color-accent)] text-[var(--color-on-accent)]">{children}</button>;
}

const DOC_ANCHOR = "concepts/projects/#defining-entry-points";
