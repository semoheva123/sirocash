import { NextResponse } from "next/server";
import { requireUser } from "@/lib/email-auth";
import { sameOrigin } from "@/lib/api";
import { readJson } from "@/lib/request-body";
import { database } from "@/lib/database";
import {
  publicReceivingIdentity,
  receivingProfileInput,
} from "@/lib/receiving-identity";
import { securityFailure, securityHeaders } from "@/lib/security-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const {
      rows: [profile],
    } = await database().query(
      'SELECT i.uid,i."displayName",i.username,u."kycStatus" FROM "ReceivingIdentity" i JOIN "User" u ON u.id=i."userId" WHERE i."userId"=$1',
      [user.id],
    );
    if (!profile) throw Error();
    return NextResponse.json(
      { userId: user.id, identity: publicReceivingIdentity(profile) },
      { headers: securityHeaders },
    );
  } catch {
    return securityFailure(
      "تعذّر تحميل معرّف الاستلام. / Receiving identity unavailable.",
      503,
    );
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const user = await requireUser(request);
    // Independent autocommit budget: rejected profile changes consume an attempt too.
    const {
      rows: [budget],
    } = await database().query(
      "SELECT public.receiving_identity_budget($1::uuid,$2) AS allowed",
      [user.id, "profile"],
    );
    if (!budget?.allowed)
      return securityFailure(
        "محاولات كثيرة. حاول بعد دقيقة. / Too many attempts. Try in a minute.",
        429,
      );
    const data = receivingProfileInput.parse(await readJson(request, 2048));
    const { rows } = await database().query(
      'UPDATE "ReceivingIdentity" SET "displayName"=$2,username=$3 WHERE "userId"=$1 AND (username IS NULL OR username IS NOT DISTINCT FROM $3) RETURNING uid',
      [user.id, data.displayName, data.username],
    );
    if (!rows.length) throw Error();
    return NextResponse.json({ ok: true }, { headers: securityHeaders });
  } catch {
    return securityFailure(
      "تعذّر حفظ الاسم. اسم المستخدم يجب أن يكون متاحًا ولا يمكن تغييره بعد اختياره. / Could not save. The username must be available and cannot be changed once set.",
      400,
    );
  }
}
