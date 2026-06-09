import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="flex flex-1 items-center justify-center bg-gradient-to-b from-page to-card px-4 py-12">
      <SignUp />
    </main>
  );
}
