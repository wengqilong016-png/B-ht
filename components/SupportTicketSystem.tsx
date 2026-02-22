import React, { useState } from 'react';
import { Brain, MessageSquare, ShieldAlert, CheckCircle, RefreshCcw, Send } from 'lucide-react';
import { supabase } from '../supabaseClient';

interface SupportTicket {
  id: string;
  user_input: string;
  category: string;
  tone: string;
  amount: number | null;
  suggested_action: string;
  status: 'pending' | 'resolved' | 'flagged';
  timestamp: string;
}

const SupportTicketSystem: React.FC = () => {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [inputText, setInputText] = useState('');

  // 模拟从生成的 50 条数据中加载
  const loadSimulatedData = async () => {
    try {
      const response = await fetch('/payment_failure_dataset.json');
      const data = await response.json();
      const mapped = data.slice(0, 10).map((item: any, index: number) => {
        const output = JSON.parse(item.output);
        return {
          id: output.ticket_id,
          user_input: item.input,
          category: output.error_code,
          tone: output.user_tone,
          amount: output.amount_lost,
          suggested_action: output.recommended_action,
          status: 'pending',
          timestamp: output.timestamp
        };
      });
      setTickets(mapped);
    } catch (e) {
      console.error("Failed to load simulated data. Make sure the file exists in public/ or dist/", e);
    }
  };

  const handleManualAnalyze = async () => {
    if (!inputText) return;
    setIsAnalyzing(true);
    
    // 实践逻辑：调用 AI 进行分类 (此处模拟 AI 返回)
    setTimeout(() => {
      const newTicket: SupportTicket = {
        id: `SK-${Date.now()}`,
        user_input: inputText,
        category: "AI_ANALYZED",
        tone: "Detecting...",
        amount: null,
        suggested_action: "manual_review",
        status: 'flagged',
        timestamp: new Date().toISOString()
      };
      setTickets([newTicket, ...tickets]);
      setInputText('');
      setIsAnalyzing(false);
    }, 1000);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-500 p-2 rounded-xl text-white">
              <MessageSquare size={20} />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-800">AI 客服工单系统</h2>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">实践：基于 50 种语气的数据闭环</p>
            </div>
          </div>
          <button 
            onClick={loadSimulatedData}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-black hover:bg-slate-800 transition-all"
          >
            <RefreshCcw size={14} /> 导入模拟数据
          </button>
        </div>

        <div className="relative">
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="输入用户投诉内容（或从 50 种模拟数据中复制）..."
            className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 text-sm focus:ring-0 focus:border-indigo-500 transition-all min-h-[100px]"
          />
          <button 
            onClick={handleManualAnalyze}
            disabled={isAnalyzing}
            className="absolute bottom-4 right-4 bg-indigo-600 text-white p-2 rounded-xl shadow-lg hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
          >
            {isAnalyzing ? <RefreshCcw className="animate-spin" size={20} /> : <Send size={20} />}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {tickets.map((ticket) => (
          <div key={ticket.id} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:shadow-md transition-all">
            <div className="flex justify-between items-start mb-3">
              <span className="text-[10px] font-black bg-slate-100 px-2 py-1 rounded-md text-slate-500">{ticket.id}</span>
              <div className={`flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-md ${
                ticket.status === 'flagged' ? 'bg-rose-50 text-rose-500' : 'bg-emerald-50 text-emerald-500'
              }`}>
                {ticket.status === 'flagged' ? <ShieldAlert size={10} /> : <CheckCircle size={10} />}
                {ticket.status.toUpperCase()}
              </div>
            </div>
            
            <p className="text-sm text-slate-700 font-medium mb-4 italic">"{ticket.user_input}"</p>
            
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-slate-50 p-2 rounded-xl text-center">
                <p className="text-[8px] font-black text-slate-400 uppercase">语气</p>
                <p className="text-[10px] font-bold text-slate-800">{ticket.tone}</p>
              </div>
              <div className="bg-slate-50 p-2 rounded-xl text-center">
                <p className="text-[8px] font-black text-slate-400 uppercase">损失金额</p>
                <p className="text-[10px] font-bold text-rose-500">{ticket.amount || 'N/A'} TZS</p>
              </div>
              <div className="bg-indigo-50 p-2 rounded-xl text-center">
                <p className="text-[8px] font-black text-indigo-400 uppercase">推荐操作</p>
                <p className="text-[10px] font-bold text-indigo-600">{ticket.suggested_action}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SupportTicketSystem;
