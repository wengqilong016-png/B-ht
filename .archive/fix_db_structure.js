// ⚠️  DO NOT hardcode the service_role key here — pass it via environment variable:
//    SUPABASE_SERVICE_ROLE_KEY=<your_key> node fix_db_structure.js
// Find the key in Supabase Dashboard → Settings → API → service_role (secret).
import { createClient } from '@supabase/supabase-js'

const url = 'https://yctsiudhicztvppddbvk.supabase.co'
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(url, serviceRole)

async function fixTableStructure() {
  console.log('=== 正在检查并修复 locations 表结构 ===')

  // 由于 supabase-js 不能直接执行 ALTER TABLE，我们需要使用一个通用的方法。
  // 检查是否已经存在 exec_sql 函数，如果不存在则报错。
  // 或者我们可以尝试通过 RPC 如果项目里有定义。
  
  // 先尝试直接查询来看看问题是否还在
  const { error } = await supabase.from('locations').select('resetLocked').limit(1)
  
  if (error && error.message.includes('column locations.resetLocked does not exist')) {
    console.log('❌ 确认缺失 resetLocked 列。')
    console.log('⚠️ 请在 Supabase SQL Editor 中运行以下代码以修复：')
    console.log(`
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS "resetLocked" BOOLEAN DEFAULT false;
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS "dividendBalance" NUMERIC DEFAULT 0;
    `)
  } else if (!error) {
    console.log('✅ resetLocked 列已存在。')
  } else {
    console.log('❌ 其他错误:', error.message)
  }
}

fixTableStructure()
