import { AppShell } from '@/components/app-shell';

export default function AppLayout({ children }: LayoutProps<'/[locale]'>) {
  return <AppShell>{children}</AppShell>;
}
