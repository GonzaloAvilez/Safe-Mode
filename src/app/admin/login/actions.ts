"use server";

import { redirect } from "next/navigation";
import { verifyAdminPassword, createAdminSession } from "@/lib/admin-session";

export type LoginState = { error: string } | undefined;

export async function loginAdmin(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const password = formData.get("password");

  if (typeof password !== "string" || !verifyAdminPassword(password)) {
    return { error: "Contraseña incorrecta." };
  }

  await createAdminSession();
  redirect("/admin");
}
