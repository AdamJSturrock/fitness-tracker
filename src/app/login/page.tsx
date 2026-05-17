import { redirect } from 'next/navigation';
import { isAuthed } from '@/lib/auth';
import LoginForm from './login-form';

export default async function LoginPage() {
  if (await isAuthed()) {
    redirect('/');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-6 dark:bg-neutral-950">
      <LoginForm />
    </main>
  );
}
