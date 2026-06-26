import { AuthScreen } from "@/components/auth-form";

export const metadata = { title: "Sign in — ExamCert" };

export default function LoginPage() {
  return <AuthScreen mode="login" />;
}
