"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { deleteAdminSession, requireAdminSession } from "@/lib/admin-session";
import { setSitePublic } from "@/lib/settings";

export async function logoutAdmin(): Promise<void> {
  await deleteAdminSession();
  redirect("/admin/login");
}

export async function setSitePublicAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  await setSitePublic(formData.get("value") === "true");
  revalidatePath("/", "layout");
}
