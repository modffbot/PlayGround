"use server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { notifyAdmin, newPlayerMessage, eventMessage } from "@/lib/telegram";
import { redirect } from "next/navigation";

/** Create notification_outbox row idempotently; fire telegram in background (never blocks signup). */
async function queueTelegram(kind: string, eventKey: string, html: string, payload: unknown) {
  try {
    const admin: any = createAdminClient();
    const { data: existing } = await admin.from("notification_outbox").select("id,status").eq("event_key", eventKey).maybeSingle();
    if (existing?.status === "sent") return;
    if (!existing) {
      await admin.from("notification_outbox").insert({ event_key: eventKey, kind, payload: payload as any, status: "pending" });
    }
    const r = await notifyAdmin(html);
    await admin.from("notification_outbox").update({
      status: r.ok ? "sent" : "failed",
      attempts: 1,
      last_error: (r as any).error ?? null,
    }).eq("event_key", eventKey);
  } catch (e) {
    console.error("[outbox]", e);
  }
}

export async function signupAction(formData: FormData) {
  const supabase = createClient();
  const full_name = String(formData.get("full_name") ?? "").trim();
  const username = String(formData.get("username") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");
  const ff_uid = String(formData.get("ff_uid") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const team_name = String(formData.get("team_name") ?? "").trim();
  const share = formData.get("share_phone_with_admin") === "on";
  const terms = formData.get("terms") === "on";

  if (!full_name || !username || !email || !password) return { error: "الحقول الإلزامية: الاسم، اسم المستخدم، البريد، كلمة المرور" };
  if (password !== confirm) return { error: "كلمتا المرور غير متطابقتين" };
  if (!terms) return { error: "يجب الموافقة على الشروط وسياسة الخصوصية" };
  if (!/^[a-zA-Z0-9_.-]{3,24}$/.test(username)) return { error: "اسم المستخدم: إنجليزية/أرقام فقط (3-24)" };
  if (ff_uid && !/^[0-9]{5,12}$/.test(ff_uid)) return { error: "UID أرقام فقط (5-12)" };
  if (phone && !/^\+?[0-9\s-]{7,16}$/.test(phone)) return { error: "رقم الهاتف غير صالح" };

  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name, username } } });
  if (error) return { error: error.message };
  const user = data.user;
  if (!user) return { ok: true };

  // profiles insert (username unique enforced by DB; surface duplicate nicely)
  const admin: any = createAdminClient();
  const { error: pErr } = await admin.from("profiles").insert({
    id: user.id, full_name, username, email, ff_uid: ff_uid || null,
    phone: phone || null, share_phone_with_admin: share, team_name: team_name || null,
  });
  if (pErr) {
    if (pErr.message?.includes("duplicate") || pErr.code === "23505") {
      return { error: "اسم المستخدم مسجّل مسبقًا — اختر اسمًا آخر" };
    }
    return { error: "تم إنشاء الحساب لكن تعذّر حفظ الملف: " + pErr.message };
  }
  // total count (real)
  let total = 1;
  try {
    const c = await admin.from("profiles").select("id", { count: "exact", head: true });
    total = c.count ?? 1;
  } catch {}
  const html = newPlayerMessage({
    full_name, username, ff_uid, team_name,
    created_at: new Date().toLocaleString("ar-EG"),
    email_confirmed: user.email_confirmed_at ? "مؤكد ✅" : "غير مؤكد ⏳",
    phone, share_phone: share, total,
  });
  // fire-and-forget (await but never fails signup)
  await queueTelegram("signup", `signup:${user.id}`, html, { user_id: user.id, username });
  redirect("/confirm-email");
}

export async function loginAction(formData: FormData) {
  const supabase = createClient();
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "بيانات الدخول غير صحيحة" };
  redirect("/dashboard");
}

export async function logoutAction() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function registerTournamentAction(tournamentId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "سجّل الدخول أولًا" };
  const admin: any = createAdminClient();
  const { data, error } = await admin.rpc("register_for_tournament", { p_tournament: tournamentId, p_user: user.id });
  if (error) return { error: "تعذّر التسجيل: " + error.message };
  if (!data?.ok) {
    const map: Record<string, string> = {
      "already-registered": "أنت مسجّل مسبقًا في هذه البطولة",
      "registration-closed": "التسجيل مغلق حاليًا",
      "tournament-not-found": "البطولة غير موجودة",
    };
    return { error: map[data?.error] ?? "تعذّر التسجيل" };
  }
  const t = await admin.from("tournaments").select("title,max_slots,registered_count").eq("id", tournamentId).single();
  const html = eventMessage("🎮 تسجيل جديد في بطولة", {
    "البطولة": t.data?.title ?? tournamentId,
    "اللاعب": user.email ?? user.id,
    "الحالة": data.status === "waitlist" ? "قائمة انتظار" : "مؤكد",
  });
  await queueTelegram("tournament_register", `treg:${tournamentId}:${user.id}`, html, { tournament_id: tournamentId, user_id: user.id });
  if (t.data && t.data.registered_count >= t.data.max_slots) {
    await queueTelegram("tournament_full", `tfull:${tournamentId}`, eventMessage("🔥 البطولة اكتملت!", { "البطولة": t.data.title, "السعة": t.data.max_slots }), { tournament_id: tournamentId });
  }
  return { ok: true, status: data.status };
}
