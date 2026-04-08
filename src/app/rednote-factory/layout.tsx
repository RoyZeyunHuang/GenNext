import { LocaleProvider } from "@/contexts/LocaleContext";
import { RednoteFactoryShell } from "@/components/rednote-factory/RednoteFactoryShell";

export default function RednoteFactoryRootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <LocaleProvider>
      <RednoteFactoryShell>{children}</RednoteFactoryShell>
    </LocaleProvider>
  );
}
