import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function Home() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // El dashboard real vive en /home para no chocar con el redirect de login
  redirect("/home");
}