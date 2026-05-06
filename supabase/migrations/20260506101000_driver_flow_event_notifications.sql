-- P1A: create durable notifications from driver_flow_events submit telemetry.
-- This migration is idempotent: the trigger inserts/backfills one notification per
-- driver_flow_events.id through notifications."driverFlowEventId".

ALTER TABLE public.notifications
    ADD COLUMN IF NOT EXISTS "driverFlowEventId" UUID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_driver_flow_event_id
    ON public.notifications ("driverFlowEventId")
    WHERE "driverFlowEventId" IS NOT NULL;

CREATE OR REPLACE FUNCTION public.on_driver_flow_event_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_payload JSONB;
    v_tx_id TEXT;
    v_driver_name TEXT;
    v_location_name TEXT;
    v_score_line TEXT;
    v_revenue_line TEXT;
    v_reason TEXT;
    v_type TEXT;
    v_title TEXT;
    v_message TEXT;
BEGIN
    IF NEW.event_name NOT IN (
        'submit_success',
        'submit_offline_queued',
        'submit_failed',
        'submit_zero_revenue'
    ) THEN
        RETURN NEW;
    END IF;

    v_payload := COALESCE(NEW.payload, '{}'::jsonb);
    v_tx_id := COALESCE(v_payload->>'txId', NEW.draft_tx_id, NEW.id::text);
    v_driver_name := COALESCE(NULLIF(v_payload->>'driverName', ''), NEW.driver_id, '未知司机');
    v_location_name := COALESCE(NULLIF(v_payload->>'locationName', ''), NULLIF(NEW.location_id, ''), 'Unknown machine');
    v_score_line := COALESCE(NULLIF(v_payload->>'previousScore', ''), '—')
        || ' → '
        || COALESCE(NULLIF(v_payload->>'currentScore', ''), '—');
    v_revenue_line := 'TZS ' || COALESCE(NULLIF(v_payload->>'revenue', ''), '0');
    v_reason := COALESCE(NULLIF(NEW.error_category, ''), NULLIF(v_payload->>'reason', ''), '未知错误');

    CASE NEW.event_name
        WHEN 'submit_offline_queued' THEN
            v_type := 'driver_collection_offline';
            v_title := '离线收款待同步：' || v_driver_name;
            v_message := v_location_name || '｜' || v_revenue_line || '｜分数 ' || v_score_line
                || '｜联网同步后管理端可见｜交易号 ' || v_tx_id;
        WHEN 'submit_failed' THEN
            v_type := 'driver_collection_failed';
            v_title := '收款失败：' || v_driver_name;
            v_message := v_location_name || '｜分数 ' || v_score_line
                || '｜原因：' || v_reason || '｜交易号 ' || v_tx_id;
        WHEN 'submit_zero_revenue' THEN
            v_type := 'driver_collection_zero_revenue';
            v_title := '零营业额异常：' || v_driver_name;
            v_message := v_location_name || '｜' || v_revenue_line || '｜分数 ' || v_score_line
                || '｜云端已记录但营业额为 0，请核查上次分数｜交易号 ' || v_tx_id;
        ELSE
            IF EXISTS (SELECT 1 FROM public.transactions WHERE id = v_tx_id) THEN
                v_type := 'driver_collection_success';
                v_title := '收款成功：' || v_driver_name;
                v_message := v_location_name || '｜' || v_revenue_line || '｜分数 ' || v_score_line
                    || '｜管理端已可见｜交易号 ' || v_tx_id;
            ELSE
                v_type := 'driver_collection_failed';
                v_title := '成功事件无交易：' || v_driver_name;
                v_message := v_location_name || '｜分数 ' || v_score_line
                    || '｜原本记录为成功，但交易表没有对应交易，请人工核查｜交易号 ' || v_tx_id;
            END IF;
    END CASE;

    INSERT INTO public.notifications (
        type,
        title,
        message,
        "timestamp",
        "isRead",
        "driverId",
        "relatedTransactionId",
        "driverFlowEventId"
    ) VALUES (
        v_type,
        v_title,
        v_message,
        COALESCE(NEW.created_at, NOW()),
        FALSE,
        NEW.driver_id,
        v_tx_id,
        NEW.id
    )
    ON CONFLICT DO NOTHING;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_on_driver_flow_event_notification ON public.driver_flow_events;
CREATE TRIGGER trigger_on_driver_flow_event_notification
AFTER INSERT ON public.driver_flow_events
FOR EACH ROW
WHEN (NEW.event_name IN (
    'submit_success',
    'submit_offline_queued',
    'submit_failed',
    'submit_zero_revenue'
))
EXECUTE FUNCTION public.on_driver_flow_event_notification();

-- Prevent direct invocation with definer privileges; the function remains callable
-- through the trigger above.
REVOKE EXECUTE ON FUNCTION public.on_driver_flow_event_notification() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.on_driver_flow_event_notification() FROM authenticated;

-- Backfill recent submit events only.  The partial unique index and ON CONFLICT
-- keep this safe to re-run after the trigger has already inserted some rows.
INSERT INTO public.notifications (
    type,
    title,
    message,
    "timestamp",
    "isRead",
    "driverId",
    "relatedTransactionId",
    "driverFlowEventId"
)
SELECT
    CASE
        WHEN e.event_name = 'submit_success' AND t.id IS NULL THEN 'driver_collection_failed'
        WHEN e.event_name = 'submit_offline_queued' THEN 'driver_collection_offline'
        WHEN e.event_name = 'submit_failed' THEN 'driver_collection_failed'
        WHEN e.event_name = 'submit_zero_revenue' THEN 'driver_collection_zero_revenue'
        ELSE 'driver_collection_success'
    END AS type,
    CASE
        WHEN e.event_name = 'submit_success' AND t.id IS NULL THEN '成功事件无交易：' || n.driver_name
        WHEN e.event_name = 'submit_offline_queued' THEN '离线收款待同步：' || n.driver_name
        WHEN e.event_name = 'submit_failed' THEN '收款失败：' || n.driver_name
        WHEN e.event_name = 'submit_zero_revenue' THEN '零营业额异常：' || n.driver_name
        ELSE '收款成功：' || n.driver_name
    END AS title,
    CASE
        WHEN e.event_name = 'submit_success' AND t.id IS NULL THEN n.location_name || '｜分数 ' || n.score_line
            || '｜原本记录为成功，但交易表没有对应交易，请人工核查｜交易号 ' || n.tx_id
        WHEN e.event_name = 'submit_offline_queued' THEN n.location_name || '｜' || n.revenue_line || '｜分数 ' || n.score_line
            || '｜联网同步后管理端可见｜交易号 ' || n.tx_id
        WHEN e.event_name = 'submit_failed' THEN n.location_name || '｜分数 ' || n.score_line
            || '｜原因：' || n.reason || '｜交易号 ' || n.tx_id
        WHEN e.event_name = 'submit_zero_revenue' THEN n.location_name || '｜' || n.revenue_line || '｜分数 ' || n.score_line
            || '｜云端已记录但营业额为 0，请核查上次分数｜交易号 ' || n.tx_id
        ELSE n.location_name || '｜' || n.revenue_line || '｜分数 ' || n.score_line
            || '｜管理端已可见｜交易号 ' || n.tx_id
    END AS message,
    COALESCE(e.created_at, NOW()) AS "timestamp",
    FALSE AS "isRead",
    e.driver_id AS "driverId",
    n.tx_id AS "relatedTransactionId",
    e.id AS "driverFlowEventId"
FROM public.driver_flow_events e
CROSS JOIN LATERAL (
    SELECT COALESCE(e.payload, '{}'::jsonb) AS payload
) p
CROSS JOIN LATERAL (
    SELECT
        COALESCE(p.payload->>'txId', e.draft_tx_id, e.id::text) AS tx_id,
        COALESCE(NULLIF(p.payload->>'driverName', ''), e.driver_id, '未知司机') AS driver_name,
        COALESCE(NULLIF(p.payload->>'locationName', ''), NULLIF(e.location_id, ''), 'Unknown machine') AS location_name,
        COALESCE(NULLIF(p.payload->>'previousScore', ''), '—')
            || ' → '
            || COALESCE(NULLIF(p.payload->>'currentScore', ''), '—') AS score_line,
        'TZS ' || COALESCE(NULLIF(p.payload->>'revenue', ''), '0') AS revenue_line,
        COALESCE(NULLIF(e.error_category, ''), NULLIF(p.payload->>'reason', ''), '未知错误') AS reason
) n
LEFT JOIN public.transactions t ON t.id = n.tx_id
WHERE e.event_name IN (
    'submit_success',
    'submit_offline_queued',
    'submit_failed',
    'submit_zero_revenue'
)
AND e.created_at >= NOW() - INTERVAL '7 days'
ON CONFLICT DO NOTHING;
