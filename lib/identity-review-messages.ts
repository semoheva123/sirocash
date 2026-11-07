/** Precise, non-leaking reasons for a document-store refusal; the store itself never returns text we would echo. */
export function reviewGatewayFailure(action:string,status:number){
 if(status===409)return 'تعذّر تسجيل القرار: الطلب لم يعد معلّقًا (رُوجع أو انتهت صلاحيته)، أو هو طلبك الشخصي ويُحظر على المراجع البتّ في طلبه. حدّث القائمة.';
 if(status===404)return action==='document'?'الوثيقة غير متاحة: حُذفت وفق سياسة الاحتفاظ أو لم يكتمل رفعها. حدّث القائمة.':'الطلب غير موجود أو لم يعد معلّقًا. حدّث القائمة.';
 if(status===429)return 'تم بلوغ حد إجراءات المراجعة لهذه الساعة. يُرجى المحاولة لاحقًا.';
 if(status===401||status===403)return 'خدمة الوثائق رفضت صلاحية المراجعة. راجع إعداد رمز المراجعة لدى المشغّل.';
 return 'خدمة الوثائق غير متاحة مؤقتًا. لم يُسجَّل أي قرار؛ حاول لاحقًا.';
}
