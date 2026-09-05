/*
  Enable the already-existing Design 06–10 tables in the same fixed routing
  model as Design 01–05. This does not alter table columns or data.
*/

CREATE OR REPLACE FUNCTION public.validate_design_code()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.design_code := lower(trim(NEW.design_code));
  IF NEW.design_code NOT IN (
    'design_01','design_02','design_03','design_04','design_05',
    'design_06','design_07','design_08','design_09','design_10'
  ) THEN
    RAISE EXCEPTION 'Design code must be one of: design_01 through design_10';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.sync_invitation_detail()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE suffix text; target text;
BEGIN
  SELECT right(design_code, 2) INTO suffix FROM public.designs WHERE id = NEW.design_id;
  target := CASE suffix
    WHEN '01' THEN 'design_01_invitations' WHEN '02' THEN 'design_02_invitations'
    WHEN '03' THEN 'design_03_invitations' WHEN '04' THEN 'design_04_invitations'
    WHEN '05' THEN 'design_05_invitations' WHEN '06' THEN 'design_06_invitations'
    WHEN '07' THEN 'design_07_invitations' WHEN '08' THEN 'design_08_invitations'
    WHEN '09' THEN 'design_09_invitations' WHEN '10' THEN 'design_10_invitations'
  END;
  IF target IS NOT NULL THEN
    EXECUTE format('UPDATE public.%1$I SET slug_%2$s=$1, public_url=$2, start_date=$3, end_date=$4 WHERE central_invitation_id=$5', target, suffix)
      USING NEW.slug, NEW.public_url, NEW.start_date, NEW.end_date, NEW.id;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.create_invitation(
  p_design_id uuid, p_slug text, p_content jsonb,
  p_start_date timestamptz DEFAULT NULL, p_end_date timestamptz DEFAULT NULL,
  p_status text DEFAULT 'draft'
)
RETURNS public.invitations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d public.designs; inv public.invitations; sid uuid; code text; final_slug text;
  target text; suffix text; public_link text; detail_start timestamptz;
  detail_end timestamptz; detail_status text; wedding_at timestamptz;
BEGIN
  PERFORM public.require_active_actor();
  SELECT shop_id INTO sid FROM public.admin_profiles WHERE user_id = auth.uid();
  IF public.is_admin() THEN sid := NULLIF(p_content->>'shop_id', '')::uuid; END IF;
  IF sid IS NULL THEN RAISE EXCEPTION 'A shop is required'; END IF;
  SELECT * INTO d FROM public.designs WHERE id = p_design_id AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Design is not active'; END IF;
  IF NOT public.is_admin() AND NOT EXISTS (
    SELECT 1 FROM public.shop_design_assignments WHERE shop_id=sid AND design_id=p_design_id AND status='assigned'
  ) THEN RAISE EXCEPTION 'Design is not assigned to this shop'; END IF;
  target := CASE d.design_code
    WHEN 'design_01' THEN 'design_01_invitations' WHEN 'design_02' THEN 'design_02_invitations'
    WHEN 'design_03' THEN 'design_03_invitations' WHEN 'design_04' THEN 'design_04_invitations'
    WHEN 'design_05' THEN 'design_05_invitations' WHEN 'design_06' THEN 'design_06_invitations'
    WHEN 'design_07' THEN 'design_07_invitations' WHEN 'design_08' THEN 'design_08_invitations'
    WHEN 'design_09' THEN 'design_09_invitations' WHEN 'design_10' THEN 'design_10_invitations'
  END;
  suffix := right(d.design_code, 2);
  IF target IS NULL THEN RAISE EXCEPTION 'Unsupported design code'; END IF;
  final_slug := lower(regexp_replace(coalesce(nullif(trim(p_slug), ''), concat_ws('-', p_content->>'groom_name', p_content->>'bride_name')), '[^a-zA-Z0-9]+', '-', 'g'));
  final_slug := trim(both '-' FROM final_slug);
  IF final_slug = '' OR final_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN RAISE EXCEPTION 'Invalid slug'; END IF;
  detail_start := coalesce(p_start_date, now());
  detail_end := coalesce(p_end_date, detail_start + interval '365 days');
  IF detail_end <= detail_start THEN RAISE EXCEPTION 'Invitation end time must be after the start time'; END IF;
  wedding_at := nullif(p_content->>'wedding_date', '')::timestamptz;
  detail_status := CASE WHEN p_status='active' THEN 'published' ELSE 'draft' END;
  code := 'ZAR-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  public_link := rtrim(d.production_url, '/') || '/' || final_slug;
  p_content := jsonb_set(p_content, '{qr_url}', to_jsonb(public_link));
  INSERT INTO public.invitations(shop_id,design_id,groom_name,bride_name,slug,invitation_code,public_url,start_date,end_date,status,created_by,updated_by)
  VALUES(sid,p_design_id,p_content->>'groom_name',p_content->>'bride_name',final_slug,code,public_link,p_start_date,p_end_date,
    CASE WHEN p_status IN ('draft','active') THEN p_status ELSE 'draft' END,auth.uid(),auth.uid()) RETURNING * INTO inv;
  EXECUTE format(
    'INSERT INTO public.%1$I (central_invitation_id,invitation_data,public_url,start_date,end_date,
      slug_%2$s,invitation_code_%2$s,status_%2$s,active_from_%2$s,active_until_%2$s,
      groom_name_%2$s,bride_name_%2$s,groom_photo_url_%2$s,bride_photo_url_%2$s,
      parents_%2$s,education_%2$s,occupation_%2$s,relatives_%2$s,
      venue_name_%2$s,venue_address_%2$s,venue_city_%2$s,venue_maps_url_%2$s,venue_image_url_%2$s,
      events_%2$s,couple_photos_%2$s,memories_gallery_%2$s,social_links_%2$s,
      qr_center_text_%2$s,created_by_%2$s,updated_by_%2$s,wedding_date_%2$s,music_enabled_%2$s)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32)', target, suffix
  ) USING inv.id,p_content,public_link,p_start_date,p_end_date,final_slug,code,detail_status,detail_start,detail_end,
    coalesce(p_content->>'groom_name',''),coalesce(p_content->>'bride_name',''),nullif(p_content->>'groom_photo_url',''),nullif(p_content->>'bride_photo_url',''),
    jsonb_build_object('groom',coalesce(p_content->>'groom_parents',''),'bride',coalesce(p_content->>'bride_parents','')),
    concat_ws(' | ',nullif(p_content->>'groom_qualification',''),nullif(p_content->>'bride_qualification','')),
    concat_ws(' | ',nullif(p_content->>'groom_occupation',''),nullif(p_content->>'bride_occupation','')),
    jsonb_build_object('text',coalesce(p_content->>'relatives','')),coalesce(nullif(p_content->>'venue_name',''),''),coalesce(nullif(p_content->>'venue_address',''),''),
    coalesce(nullif(p_content->>'city',''),''),coalesce(nullif(p_content->>'maps_url',''),''),nullif(p_content->>'venue_image_url',''),
    coalesce(p_content->'events','[]'::jsonb),jsonb_build_array(nullif(p_content->>'groom_photo_url',''),nullif(p_content->>'bride_photo_url','')),
    coalesce(p_content->'gallery','[]'::jsonb),coalesce(p_content->'social_links','{}'::jsonb),coalesce(nullif(p_content->>'qr_text',''),'Groom & Bride Invites'),auth.uid(),auth.uid(),wedding_at,
    coalesce((p_content->>'music_enabled')::boolean,false);
  RETURN inv;
END $$;

CREATE OR REPLACE FUNCTION public.update_invitation_content(
  p_invitation_id uuid,p_slug text,p_start_date timestamptz,p_end_date timestamptz,p_status text,p_content jsonb
) RETURNS public.invitations LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE inv public.invitations; d public.designs; target text; suffix text; public_link text; detail_status text;
BEGIN
  PERFORM public.require_active_actor();
  SELECT * INTO inv FROM public.invitations WHERE id=p_invitation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invitation not found'; END IF;
  IF NOT public.is_admin() AND inv.shop_id<>public.current_shop_id() THEN RAISE EXCEPTION 'Invitation access denied'; END IF;
  SELECT * INTO d FROM public.designs WHERE id=inv.design_id;
  IF NOT FOUND OR d.design_code NOT IN ('design_01','design_02','design_03','design_04','design_05','design_06','design_07','design_08','design_09','design_10') THEN RAISE EXCEPTION 'Unsupported design'; END IF;
  suffix:=right(d.design_code,2); target:='design_'||suffix||'_invitations';
  IF p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN RAISE EXCEPTION 'Invalid slug'; END IF;
  IF p_end_date IS NOT NULL AND p_start_date IS NOT NULL AND p_end_date<=p_start_date THEN RAISE EXCEPTION 'End time must be after start time'; END IF;
  public_link:=rtrim(d.production_url,'/')||'/'||p_slug;
  UPDATE public.invitations SET slug=p_slug,public_url=public_link,start_date=p_start_date,end_date=p_end_date,status=CASE WHEN p_status IN ('draft','active','archived','expired') THEN p_status ELSE inv.status END,groom_name=coalesce(p_content->>'groom_name',groom_name),bride_name=coalesce(p_content->>'bride_name',bride_name) WHERE id=inv.id RETURNING * INTO inv;
  detail_status:=CASE WHEN inv.status='active' THEN 'published' WHEN inv.status='archived' THEN 'archived' ELSE 'draft' END;
  EXECUTE format('UPDATE public.%1$I SET invitation_data=coalesce(invitation_data,''{}''::jsonb)||$1,slug_%2$s=$2,public_url=$3,start_date=$4,end_date=$5,status_%2$s=$6,groom_name_%2$s=coalesce($1->>''groom_name'',groom_name_%2$s),bride_name_%2$s=coalesce($1->>''bride_name'',bride_name_%2$s),groom_photo_url_%2$s=nullif($1->>''groom_photo_url'',''''),bride_photo_url_%2$s=nullif($1->>''bride_photo_url'',''''),education_%2$s=concat_ws('' | '',nullif($1->>''groom_qualification'',''''),nullif($1->>''bride_qualification'','''')),occupation_%2$s=concat_ws('' | '',nullif($1->>''groom_occupation'',''''),nullif($1->>''bride_occupation'','''')),events_%2$s=coalesce($1->''events'',events_%2$s),memories_gallery_%2$s=coalesce($1->''gallery'',memories_gallery_%2$s),social_links_%2$s=coalesce($1->''social_links'',social_links_%2$s),wedding_date_%2$s=nullif($1->>''wedding_date'','''')::timestamptz,updated_by_%2$s=auth.uid() WHERE central_invitation_id=$7',target,suffix)
  USING p_content,p_slug,public_link,p_start_date,p_end_date,detail_status,inv.id;
  RETURN inv;
END $$;

CREATE OR REPLACE FUNCTION public.get_public_invitation_content(p_slug text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE inv public.invitations; d public.designs; shop public.shops; target text; detail jsonb;
BEGIN
  IF p_slug IS NULL OR p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN RETURN jsonb_build_object('state','not_found'); END IF;
  SELECT * INTO inv FROM public.invitations WHERE lower(slug)=lower(p_slug) LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('state','not_found'); END IF;
  SELECT * INTO shop FROM public.shops WHERE id=inv.shop_id;
  IF inv.status<>'active' OR shop.status<>'active' OR (inv.start_date IS NOT NULL AND inv.start_date>now()) OR (inv.end_date IS NOT NULL AND inv.end_date<now()) THEN RETURN jsonb_build_object('state','fallback','shop',jsonb_build_object('name',shop.shop_name,'phone',shop.phone,'whatsapp',shop.whatsapp,'address',shop.address,'city',shop.city,'business_contact',shop.business_contact)); END IF;
  SELECT * INTO d FROM public.designs WHERE id=inv.design_id AND status='active';
  IF NOT FOUND THEN RETURN jsonb_build_object('state','fallback','shop',jsonb_build_object('name',shop.shop_name)); END IF;
  target:=CASE d.design_code
    WHEN 'design_01' THEN 'design_01_invitations' WHEN 'design_02' THEN 'design_02_invitations' WHEN 'design_03' THEN 'design_03_invitations' WHEN 'design_04' THEN 'design_04_invitations' WHEN 'design_05' THEN 'design_05_invitations'
    WHEN 'design_06' THEN 'design_06_invitations' WHEN 'design_07' THEN 'design_07_invitations' WHEN 'design_08' THEN 'design_08_invitations' WHEN 'design_09' THEN 'design_09_invitations' WHEN 'design_10' THEN 'design_10_invitations' END;
  IF target IS NULL THEN RETURN jsonb_build_object('state','not_found'); END IF;
  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE t.central_invitation_id=$1',target) INTO detail USING inv.id;
  IF detail IS NULL THEN RETURN jsonb_build_object('state','not_found'); END IF;
  RETURN jsonb_build_object('state','live','invitation',jsonb_build_object('id',inv.id,'slug',inv.slug,'invitation_code',inv.invitation_code,'public_url',inv.public_url,'start_date',inv.start_date,'end_date',inv.end_date,'groom_name',inv.groom_name,'bride_name',inv.bride_name,'design_code',d.design_code),'shop',jsonb_build_object('name',shop.shop_name,'phone',shop.phone,'whatsapp',shop.whatsapp,'address',shop.address,'city',shop.city,'business_contact',shop.business_contact),'detail',detail,'content',detail->'invitation_data');
END $$;

DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['design_06_invitations','design_07_invitations','design_08_invitations','design_09_invitations','design_10_invitations'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',tbl||'_select_admin_or_owner',tbl);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.invitations i WHERE i.id=public.%I.central_invitation_id AND i.shop_id=public.current_shop_id()))',tbl||'_select_admin_or_owner',tbl,tbl);
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.create_invitation(uuid,text,jsonb,timestamptz,timestamptz,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_invitation(uuid,text,jsonb,timestamptz,timestamptz,text) TO authenticated;
REVOKE ALL ON FUNCTION public.update_invitation_content(uuid,text,timestamptz,timestamptz,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_invitation_content(uuid,text,timestamptz,timestamptz,text,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.get_public_invitation_content(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_invitation_content(text) TO anon,authenticated;
