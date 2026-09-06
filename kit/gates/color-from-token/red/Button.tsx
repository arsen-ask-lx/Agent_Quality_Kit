export function Button({ children }: { children: React.ReactNode }) {
  // Литерал: в тёмной теме кнопка останется светлой.
  return <button style={{ background: "#2563EB", color: "#fff" }}>{children}</button>;
}
