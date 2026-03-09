import { createClient } from '@supabase/supabase-js'

const url = 'https://yctsiudhicztvppddbvk.supabase.co'
const serviceRole = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljdHNpdWRoaWN6dHZwcGRkYnZrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTYyNTg0OCwiZXhwIjoyMDg3MjAxODQ4fQ.qcU7hekK-9EZhens0_j9obBXJfxT3gDYE9vEjczWIkM'
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
