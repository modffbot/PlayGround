import { z } from "zod";

export const usernameSchema = z.string().min(3, "اسم المستخدم 3 أحرف على الأقل").max(24).regex(/^[a-zA-Z0-9_.-]+$/, "حروف إنجليزية وأرقام و _ . - فقط");
export const passwordSchema = z.string().min(8, "كلمة المرور 8 أحرف على الأقل");
export const phoneSchema = z.string().regex(/^\+?[0-9\s-]{7,16}$/, "رقم هاتف غير صالح").optional().or(z.literal(""));
export const ffUidSchema = z.string().regex(/^[0-9]{5,12}$/, "UID يجب أن يكون أرقامًا (5-12 رقمًا)").optional().or(z.literal(""));

export const signupSchema = z.object({
  full_name: z.string().min(2, "الاسم الكامل مطلوب"),
  username: usernameSchema,
  email: z.string().email("بريد غير صالح"),
  password: passwordSchema,
  confirmPassword: z.string(),
  ff_uid: ffUidSchema,
  phone: phoneSchema,
  team_name: z.string().max(60).optional().or(z.literal("")),
  share_phone_with_admin: z.boolean().default(false),
  terms: z.literal(true, { errorMap: () => ({ message: "يجب الموافقة على الشروط" }) }),
}).refine((d) => d.password === d.confirmPassword, { message: "كلمتا المرور غير متطابقتين", path: ["confirmPassword"] });

export const loginSchema = z.object({
  email: z.string().email("بريد غير صالح"),
  password: z.string().min(1, "أدخل كلمة المرور"),
});

export const profileUpdateSchema = z.object({
  full_name: z.string().min(2).optional(),
  ff_uid: ffUidSchema,
  phone: phoneSchema,
  team_name: z.string().max(60).optional().or(z.literal("")),
  share_phone_with_admin: z.boolean().optional(),
  avatar_url: z.string().url().optional().or(z.literal("")),
});

export const teamSchema = z.object({
  name: z.string().min(3, "اسم الفريق مطلوب").max(50),
  tag: z.string().max(8).optional().or(z.literal("")),
  description: z.string().max(500).optional().or(z.literal("")),
});

export const tournamentSchema = z.object({
  title: z.string().min(3),
  mode: z.enum(["solo", "duo", "squad"]),
  max_slots: z.number().int().min(2).max(512),
  starts_at: z.string(),
  rules: z.string().optional().or(z.literal("")),
  prize: z.string().optional().or(z.literal("")),
});

export type SignupInput = z.infer<typeof signupSchema>;
