"use server";

import { redirect } from "next/navigation";
import { deleteAdminSession } from "@/lib/admin-session";

export async function logoutAdmin(): Promise<void> {
  await deleteAdminSession();
  redirect("/admin/login");
}
