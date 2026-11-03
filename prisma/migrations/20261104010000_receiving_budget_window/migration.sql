-- Keep caps and role grants. Anchor a 60-second window to the first accepted request,
-- not the calendar minute: a burst straddling :59/:00 must not obtain a fresh budget.
CREATE OR REPLACE FUNCTION public.receiving_identity_budget(owner_id uuid,kind text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE allowed boolean; cap integer;
BEGIN
 IF kind NOT IN ('lookup','profile') THEN RETURN false; END IF;
 cap:=CASE WHEN kind='lookup' THEN 10 ELSE 5 END;
 INSERT INTO public."ReceivingIdentityBudget"("userId",action,"windowStart",count) VALUES(owner_id,kind,statement_timestamp(),1)
 ON CONFLICT("userId",action) DO UPDATE SET
 "windowStart"=CASE WHEN EXCLUDED."windowStart">="ReceivingIdentityBudget"."windowStart"+interval '60 seconds' THEN EXCLUDED."windowStart" ELSE "ReceivingIdentityBudget"."windowStart" END,
 count=CASE WHEN EXCLUDED."windowStart">="ReceivingIdentityBudget"."windowStart"+interval '60 seconds' THEN 1 ELSE "ReceivingIdentityBudget".count+1 END
 WHERE EXCLUDED."windowStart">="ReceivingIdentityBudget"."windowStart"+interval '60 seconds' OR "ReceivingIdentityBudget".count<cap RETURNING true INTO allowed;
 RETURN coalesce(allowed,false);
END $$;
