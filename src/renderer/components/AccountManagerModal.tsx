import React, { useState } from 'react';
import { AccountProfile, ProviderAccountStore, ProviderId, ProviderStatus } from '../../shared/types.js';
import {
  X,
  Users,
  Plus,
  Star,
  ArrowUp,
  ArrowDown,
  Trash2,
  Check,
  ExternalLink,
  Edit2,
  ShieldCheck,
  Zap,
  Clock,
  KeyRound,
} from 'lucide-react';
import { soundFx } from '../audio/soundFx.js';

interface AccountManagerModalProps {
  providerId: ProviderId;
  providerStatus?: ProviderStatus;
  accountStore?: ProviderAccountStore;
  onClose: () => void;
  onAddAccount: (providerId: ProviderId, alias: string) => Promise<any>;
  onUpdateAlias: (providerId: ProviderId, accountId: string, alias: string) => Promise<any>;
  onSetMain: (providerId: ProviderId, accountId: string) => Promise<any>;
  onSetActive: (providerId: ProviderId, accountId: string) => Promise<any>;
  onReorder: (providerId: ProviderId, accountIds: string[]) => Promise<any>;
  onDelete: (providerId: ProviderId, accountId: string) => Promise<any>;
  onOpenDedicatedWindow?: (providerId: ProviderId, partitionKey: string) => void;
}

export const AccountManagerModal: React.FC<AccountManagerModalProps> = ({
  providerId,
  providerStatus,
  accountStore,
  onClose,
  onAddAccount,
  onUpdateAlias,
  onSetMain,
  onSetActive,
  onReorder,
  onDelete,
  onOpenDedicatedWindow,
}) => {
  const [newAlias, setNewAlias] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAliasText, setEditAliasText] = useState('');

  const accounts = accountStore?.accounts || [];
  const activeAccountId = accountStore?.activeAccountId;

  const handleCreate = async () => {
    if (!newAlias.trim()) return;
    soundFx.playClick();
    setIsAdding(true);
    try {
      await onAddAccount(providerId, newAlias.trim());
      setNewAlias('');
    } finally {
      setIsAdding(false);
    }
  };

  const handleStartEdit = (acc: AccountProfile) => {
    soundFx.playClick();
    setEditingId(acc.id);
    setEditAliasText(acc.alias);
  };

  const handleSaveEdit = async (acc: AccountProfile) => {
    if (!editAliasText.trim()) return;
    soundFx.playClick();
    await onUpdateAlias(providerId, acc.id, editAliasText.trim());
    setEditingId(null);
  };

  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    soundFx.playClick();
    const newOrder = [...accounts];
    const temp = newOrder[index - 1];
    newOrder[index - 1] = newOrder[index];
    newOrder[index] = temp;
    onReorder(providerId, newOrder.map((a) => a.id));
  };

  const handleMoveDown = (index: number) => {
    if (index >= accounts.length - 1) return;
    soundFx.playClick();
    const newOrder = [...accounts];
    const temp = newOrder[index + 1];
    newOrder[index + 1] = newOrder[index];
    newOrder[index] = temp;
    onReorder(providerId, newOrder.map((a) => a.id));
  };

  const handleDelete = async (acc: AccountProfile) => {
    if (accounts.length <= 1) return;
    soundFx.playClick();
    await onDelete(providerId, acc.id);
  };

  const getStatusBadge = (acc: AccountProfile) => {
    if (acc.status === 'rate_limited') {
      const remainingSec = acc.rateLimitedUntil ? Math.max(0, Math.round((acc.rateLimitedUntil - Date.now()) / 1000)) : null;
      const min = remainingSec ? Math.ceil(remainingSec / 60) : null;
      return (
        <span className="flex items-center gap-1 text-[9px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
          <Clock className="w-2.5 h-2.5" />
          <span>Rate Limited{min ? ` (${min}m)` : ''}</span>
        </span>
      );
    }
    if (acc.status === 'ready') {
      return (
        <span className="flex items-center gap-1 text-[9px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
          <ShieldCheck className="w-2.5 h-2.5" />
          <span>Ready</span>
        </span>
      );
    }
    if (acc.status === 'unauthenticated') {
      return (
        <span className="flex items-center gap-1 text-[9px] font-mono px-2 py-0.5 rounded-full bg-slate-500/20 text-slate-400 border border-slate-500/40">
          <KeyRound className="w-2.5 h-2.5" />
          <span>Not Logged In</span>
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 text-[9px] font-mono px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/40">
        <span>Error</span>
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-[#0c0d12]/95 border border-white/10 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                  {providerStatus?.name || providerId} Profiles
                </h3>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                  {accounts.length} {accounts.length === 1 ? 'Profile' : 'Profiles'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Multi-account isolation & intra-service automatic fallback
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              soundFx.playClick();
              onClose();
            }}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Account List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          <div className="text-[11px] font-medium text-slate-400 flex items-center justify-between mb-1">
            <span>Fallback Priority Order (Top to Bottom):</span>
            <span className="text-[10px] text-slate-500">Sorted by Priority Index</span>
          </div>

          {accounts.map((acc, index) => {
            const isActive = activeAccountId === acc.id;
            const isEditing = editingId === acc.id;

            return (
              <div
                key={acc.id}
                className={`p-3 rounded-xl border transition-all flex flex-col gap-2 ${
                  isActive
                    ? 'bg-cyan-950/20 border-cyan-500/40 shadow-[0_0_15px_rgba(6,182,212,0.15)]'
                    : 'bg-white/[0.02] border-white/5 hover:border-white/10'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {/* Priority Badge */}
                    <div className="w-5 h-5 rounded-md bg-white/5 border border-white/10 flex items-center justify-center text-[10px] font-mono font-bold text-slate-400 shrink-0">
                      {index + 1}
                    </div>

                    {/* Alias / Rename */}
                    {isEditing ? (
                      <div className="flex items-center gap-1.5 flex-1">
                        <input
                          type="text"
                          value={editAliasText}
                          onChange={(e) => setEditAliasText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEdit(acc);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          autoFocus
                          className="px-2 py-1 text-xs bg-black/60 border border-cyan-500/50 rounded-lg text-slate-100 focus:outline-none flex-1 font-semibold"
                        />
                        <button
                          onClick={() => handleSaveEdit(acc)}
                          className="p-1 rounded bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-semibold text-slate-100 truncate">{acc.alias}</span>
                        <button
                          onClick={() => handleStartEdit(acc)}
                          className="text-slate-500 hover:text-slate-300 transition-colors p-0.5"
                          title="Rename profile"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Status & Badges */}
                  <div className="flex items-center gap-2 shrink-0">
                    {getStatusBadge(acc)}

                    {/* Main Tag / Star */}
                    <button
                      onClick={() => {
                        soundFx.playClick();
                        onSetMain(providerId, acc.id);
                      }}
                      title={acc.isMain ? 'Primary designated account' : 'Click to set as primary account'}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-mono transition-all ${
                        acc.isMain
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold'
                          : 'bg-white/5 text-slate-400 hover:text-amber-300 border border-white/5'
                      }`}
                    >
                      <Star className={`w-2.5 h-2.5 ${acc.isMain ? 'fill-amber-400 text-amber-400' : ''}`} />
                      <span>{acc.isMain ? 'Main' : 'Set Main'}</span>
                    </button>
                  </div>
                </div>

                {/* Sub row: Partition info + actions */}
                <div className="flex items-center justify-between text-[10px] pt-1 border-t border-white/5">
                  <div className="flex items-center gap-2 text-slate-500 font-mono truncate">
                    <span className="truncate max-w-[200px]" title={acc.partitionKey}>
                      {acc.partitionKey}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* Up / Down Reorder */}
                    <button
                      onClick={() => handleMoveUp(index)}
                      disabled={index === 0}
                      className="p-1 rounded bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none text-slate-300 transition-colors"
                      title="Increase priority"
                    >
                      <ArrowUp className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => handleMoveDown(index)}
                      disabled={index === accounts.length - 1}
                      className="p-1 rounded bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none text-slate-300 transition-colors"
                      title="Decrease priority"
                    >
                      <ArrowDown className="w-3 h-3" />
                    </button>

                    {/* Open dedicated login window */}
                    {onOpenDedicatedWindow && (
                      <button
                        onClick={() => {
                          soundFx.playClick();
                          onOpenDedicatedWindow(providerId, acc.partitionKey);
                        }}
                        className="flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 transition-colors text-[10px]"
                        title="Open dedicated window to authenticate this profile"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Login Window</span>
                      </button>
                    )}

                    {/* Switch Active in Drawer */}
                    <button
                      onClick={() => {
                        soundFx.playClick();
                        onSetActive(providerId, acc.id);
                      }}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${
                        isActive
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 pointer-events-none'
                          : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10'
                      }`}
                    >
                      {isActive ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span>Active in Drawer</span>
                        </>
                      ) : (
                        <span>Mount to Drawer</span>
                      )}
                    </button>

                    {/* Delete Account */}
                    <button
                      onClick={() => handleDelete(acc)}
                      disabled={accounts.length <= 1}
                      className="p-1 rounded bg-white/5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 disabled:opacity-20 disabled:pointer-events-none border border-white/5 hover:border-rose-500/30 transition-colors"
                      title={accounts.length <= 1 ? 'Cannot delete only remaining account' : 'Delete account profile'}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Add Account Form Footer */}
        <div className="p-4 border-t border-white/10 bg-white/[0.02] flex items-center gap-2">
          <input
            type="text"
            placeholder="New profile label (e.g. Work Account, Backup Plus)..."
            value={newAlias}
            onChange={(e) => setNewAlias(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
            }}
            className="flex-1 px-3 py-2 text-xs bg-black/50 border border-white/10 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 font-medium"
          />
          <button
            onClick={handleCreate}
            disabled={!newAlias.trim() || isAdding}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-semibold shadow-[0_0_15px_rgba(6,182,212,0.3)] disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Profile</span>
          </button>
        </div>
      </div>
    </div>
  );
};
