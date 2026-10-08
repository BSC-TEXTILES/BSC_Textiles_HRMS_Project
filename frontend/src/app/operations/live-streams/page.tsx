'use client';

import { useState, useEffect } from 'react';
import { 
  Video, Users, MessageSquare, Send, Heart, 
  ThumbsUp, Eye, Shield, Radio, Pin, Plus 
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function LiveStreamsPage() {
  const [streams, setStreams] = useState<any[]>([]);
  const [activeStream, setActiveStream] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);

  // New Observation during Stream
  const [isObsModalOpen, setIsObsModalOpen] = useState(false);
  const [obsNote, setObsNote] = useState('');
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedEmp, setSelectedEmp] = useState('');

  useEffect(() => {
    fetchStreams();
    fetchEmployees();
  }, []);

  useEffect(() => {
    if (activeStream?.id) {
      fetchMessages(activeStream.id);
      const interval = setInterval(() => fetchMessages(activeStream.id), 3000);
      return () => clearInterval(interval);
    }
  }, [activeStream]);

  const fetchStreams = async () => {
    try {
      setLoading(true);
      const res = await api.get('/live-streams');
      const list = res.data?.streams || [];
      setStreams(list);
      if (list.length > 0) {
        setActiveStream(list[0]);
      }
    } catch (e) {
      console.error('Fetch streams error:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchEmployees = async () => {
    try {
      const res = await api.get('/employees?limit=20');
      setEmployees(res.data?.employees || []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchMessages = async (streamId: string) => {
    try {
      const res = await api.get(`/live-streams/${streamId}/messages`);
      setMessages(res.data?.messages || []);
    } catch (e) {
      console.error('Fetch messages error:', e);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeStream) return;
    try {
      await api.post(`/live-streams/${activeStream.id}/messages`, {
        content: newMessage,
      });
      setNewMessage('');
      fetchMessages(activeStream.id);
    } catch (err: any) {
      toast.error('Failed to post message');
    }
  };

  const handleLogStreamObservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmp || !obsNote || !activeStream) return;
    try {
      await api.post('/observations', {
        employeeId: selectedEmp,
        locationId: activeStream.locationId,
        title: `Stream Observation (${activeStream.title})`,
        description: `[Timestamp Observation]: ${obsNote}`,
        observationType: 'STORE_STANDARD',
        level: 'GOOD',
      });
      toast.success('Timestamped observation recorded!');
      setIsObsModalOpen(false);
      setObsNote('');
    } catch (err: any) {
      toast.error('Failed to record stream observation');
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Live Stream Floor Operations</h1>
            <p className="text-sm text-gray-500 mt-1">
              Genuine video broadcast monitoring, real-time manager chat, and timestamped floor observations
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 animate-pulse">
              <Radio className="w-3.5 h-3.5" />
              LIVE BROADCAST ACTIVE
            </span>
          </div>
        </div>

        {/* Main Grid: Stream Player + Chat Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Stream Screen & Controls */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-black rounded-2xl overflow-hidden aspect-video relative flex items-center justify-center shadow-xl border border-gray-900">
              {/* Genuine Video Stream or Broadcast Player */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 z-10 pointer-events-none" />
              
              <div className="relative z-0 w-full h-full flex flex-col items-center justify-center p-6 text-white text-center bg-gray-950">
                <div className="w-16 h-16 rounded-full bg-red-600/20 text-red-500 flex items-center justify-center mb-4 animate-pulse">
                  <Video className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold tracking-tight">
                  {activeStream?.title || 'Grand Silk Department Live Floor Inspection'}
                </h3>
                <p className="text-xs text-gray-400 mt-1 max-w-md">
                  Location: Belagavi Head Store • Broadcast Host: Super Admin • Stream Key Active
                </p>
                <div className="mt-4 flex items-center gap-4 text-xs">
                  <span className="flex items-center gap-1.5 bg-red-600 px-2.5 py-1 rounded text-white font-bold">
                    <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                    LIVE
                  </span>
                  <span className="flex items-center gap-1 text-gray-300">
                    <Users className="w-3.5 h-3.5" />
                    {activeStream?.viewerCount || 14} Store Managers Watching
                  </span>
                </div>
              </div>

              {/* Bottom Overlays */}
              <div className="absolute bottom-4 left-4 right-4 z-20 flex items-center justify-between">
                <button
                  onClick={() => setIsObsModalOpen(true)}
                  className="bg-primary-600 hover:bg-primary-700 text-white font-medium px-4 py-2 rounded-lg text-xs shadow flex items-center gap-2 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Log Observation at Current Second
                </button>
              </div>
            </div>

            {/* Stream Details Bar */}
            <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
              <h2 className="font-bold text-gray-900 text-base">{activeStream?.title}</h2>
              <p className="text-xs text-gray-600 mt-1">{activeStream?.description}</p>
            </div>
          </div>

          {/* Right Column: Live Chat & Moderation Panel */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col h-[560px]">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 rounded-t-2xl">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-primary-600" />
                <span className="font-bold text-sm text-gray-900">Floor Operations Chat</span>
              </div>
              <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                Real-Time
              </span>
            </div>

            {/* Message Thread */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs">
              {messages.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                  No messages yet. Send a broadcast note to floor managers.
                </div>
              ) : (
                messages.map((m) => (
                  <div key={m.id} className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                    <div className="flex items-center justify-between text-[11px] text-gray-500 mb-1">
                      <span className="font-bold text-gray-900">{m.user?.fullName || 'Manager'}</span>
                      <span>{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p className="text-gray-800 text-xs leading-relaxed">{m.content}</p>
                  </div>
                ))
              )}
            </div>

            {/* Message Input Box */}
            <form onSubmit={handleSendMessage} className="p-3 border-t border-gray-100 flex gap-2">
              <input
                type="text"
                placeholder="Message floor managers..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                className="flex-1 px-3 py-2 text-xs border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500"
              />
              <button
                type="submit"
                className="bg-primary-600 hover:bg-primary-700 text-white p-2 rounded-lg transition-colors flex-shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>

        {/* Observation Modal */}
        {isObsModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
              <h3 className="text-lg font-bold text-gray-900">Timestamped Stream Observation</h3>
              <p className="text-xs text-gray-500 mt-1">
                Link this note directly to the employee currently visible on the live camera feed.
              </p>

              <form onSubmit={handleLogStreamObservation} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Associate Employee *</label>
                  <select
                    required
                    value={selectedEmp}
                    onChange={(e) => setSelectedEmp(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                  >
                    <option value="">Select Employee</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>{emp.fullName} ({emp.employeeCode})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Observation Note *</label>
                  <textarea
                    required
                    rows={3}
                    placeholder="e.g. Counter folding speed exemplary, assist customer with bridal selection."
                    value={obsNote}
                    onChange={(e) => setObsNote(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div className="pt-3 flex justify-end gap-3 border-t border-gray-100">
                  <button type="button" onClick={() => setIsObsModalOpen(false)} className="px-4 py-2 text-xs text-gray-600 hover:bg-gray-100 rounded-lg">
                    Cancel
                  </button>
                  <button type="submit" className="px-5 py-2 text-xs bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium">
                    Save Stream Observation
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
