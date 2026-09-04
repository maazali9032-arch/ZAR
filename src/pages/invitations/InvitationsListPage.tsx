import { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Download, ExternalLink, Plus, QrCode, Share2 } from 'lucide-react';
import QRCode from 'qrcode';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { StatusBadge, Badge } from '@/components/ui/Badge';
import { PageHeader } from '@/components/ui/PageHeader';
import { Table } from '@/components/ui/Table';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/States';
import type { Invitation } from '@/types';

export function InvitationsListPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const navigate = useNavigate();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [qrInvitation, setQrInvitation] = useState<Invitation | null>(null);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [qrError, setQrError] = useState('');

  useEffect(() => {
    async function loadInvitations() {
      try {
        let query = supabase
          .from('invitations')
          .select('*, shop:shops(shop_name), design:designs(design_name, design_code, production_url)')
          .order('created_at', { ascending: false });

        if (!isAdmin && profile?.shop_id) {
          query = query.eq('shop_id', profile.shop_id);
        }

        const { data, error } = await query;
        if (error) throw error;
        setInvitations((data as Invitation[]) ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load invitations');
      } finally {
        setLoading(false);
      }
    }
    loadInvitations();
  }, [isAdmin, profile]);

  const filtered = invitations.filter((inv) => {
    const matchesSearch =
      inv.slug.toLowerCase().includes(search.toLowerCase()) ||
      inv.invitation_code.toLowerCase().includes(search.toLowerCase()) ||
      (inv.groom_name?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
      (inv.bride_name?.toLowerCase().includes(search.toLowerCase()) ?? false);
    const matchesStatus = statusFilter === 'all' || inv.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const invitationUrl = (invitation: Invitation) => {
    if (invitation.public_url) return invitation.public_url;
    const base = invitation.design?.production_url?.replace(/\/+$/, '');
    return base ? `${base}/${invitation.slug}` : '';
  };

  useEffect(() => {
    if (!qrInvitation) return;
    const url = invitationUrl(qrInvitation);
    if (!url) {
      setQrImage(null);
      setQrError('This invitation does not have a public URL yet.');
      return;
    }
    setQrImage(null);
    setQrError('');
    QRCode.toDataURL(url, { width: 360, margin: 2, errorCorrectionLevel: 'M' })
      .then(setQrImage)
      .catch(() => setQrError('Could not generate the QR image.'));
  }, [qrInvitation]);

  const downloadQr = () => {
    if (!qrImage || !qrInvitation) return;
    const anchor = document.createElement('a');
    anchor.href = qrImage;
    anchor.download = `${qrInvitation.slug}-qr.png`;
    anchor.click();
  };

  const shareQr = async () => {
    if (!qrImage || !qrInvitation) return;
    try {
      const blob = await (await fetch(qrImage)).blob();
      const file = new File([blob], `${qrInvitation.slug}-qr.png`, { type: 'image/png' });
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ title: 'Invitation QR code', files: [file] });
      } else {
        downloadQr();
        setQrError('Your browser cannot share an image directly. The QR PNG was downloaded; attach that image in WhatsApp.');
      }
    } catch {
      setQrError('Could not share the QR image.');
    }
  };

  const adminColumns = [
    {
      key: 'invitation_code',
      header: 'Code',
      render: (row: Invitation) => <span className="font-mono text-xs text-gray-700">{row.invitation_code}</span>,
    },
    {
      key: 'names',
      header: 'Couple',
      render: (row: Invitation) => (
        <span className="text-gray-900">{[row.groom_name, row.bride_name].filter(Boolean).join(' & ') || '—'}</span>
      ),
    },
    {
      key: 'slug',
      header: 'Slug',
      hideOnMobile: true,
      render: (row: Invitation) => <span className="font-mono text-xs text-gray-500">{row.slug}</span>,
    },
    {
      key: 'shop',
      header: 'Shop',
      hideOnMobile: true,
      render: (row: Invitation) => <span className="text-gray-600">{row.shop?.shop_name || '—'}</span>,
    },
    {
      key: 'design',
      header: 'Design',
      hideOnMobile: true,
      render: (row: Invitation) => <span className="text-gray-600">{row.design?.design_name || '—'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row: Invitation) => <StatusBadge status={row.status} />,
    },
  ];

  const ownerColumns = useMemo(() => [
    {
      key: 'names',
      header: 'Couple',
      render: (row: Invitation) => (
        <span className="text-gray-900">{[row.groom_name, row.bride_name].filter(Boolean).join(' & ') || '—'}</span>
      ),
    },
    {
      key: 'public_url',
      header: 'Invitation Link',
      hideOnMobile: true,
      render: (row: Invitation) => {
        const url = invitationUrl(row);
        return url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="inline-flex max-w-64 items-center gap-1 truncate text-xs font-medium text-brand-600 hover:text-brand-700"
          >
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            {url}
          </a>
        ) : <span className="text-xs text-gray-400">Not available</span>;
      },
    },
    {
      key: 'qr',
      header: 'QR Code',
      render: (row: Invitation) => (
        <Button size="sm" variant="outline" onClick={(event) => { event.stopPropagation(); setQrInvitation(row); }}>
          <QrCode className="h-4 w-4" />
          View QR
        </Button>
      ),
    },
    {
      key: 'design',
      header: 'Design',
      hideOnMobile: true,
      render: (row: Invitation) => <span className="text-gray-600">{row.design?.design_name || '—'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row: Invitation) => <StatusBadge status={row.status} />,
    },
  ], [invitations]);

  const columns = isAdmin ? adminColumns : ownerColumns;

  return (
    <div>
      <PageHeader
        title="Invitations"
        description={
          isAdmin
            ? 'Administrative overview of all invitations across all shops'
            : 'Overview of your shop\'s invitations'
        }
        action={
          (isAdmin || profile?.shop_id) && (
            <Link to="/invitations/new">
              <Button>
                <Plus className="h-4 w-4" />
                New Invitation
              </Button>
            </Link>
          )
        }
      />

      <Card padding="none" className="mb-4">
        <div className="flex flex-col gap-3 border-b border-gray-100 p-4 sm:flex-row sm:items-center">
          <Input
            placeholder="Search by code, slug, or couple name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input-base sm:w-40"
          >
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
          </select>
        </div>
        {loading ? (
          <div className="p-4">
            <TableSkeleton rows={5} cols={6} />
          </div>
        ) : error ? (
          <div className="p-4">
            <ErrorState message={error} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="No invitations yet"
              description="Invitations created by shop owners will appear here."
            />
          </div>
        ) : (
          <>
            <div className="hidden md:block">
              <Table
                columns={columns}
                data={filtered}
                onRowClick={(row) => navigate(`/invitations/${row.id}`)}
              />
            </div>
            <div className="space-y-3 p-4 md:hidden">
              {filtered.map((invitation) => {
                const couple = [invitation.groom_name, invitation.bride_name].filter(Boolean).join(' & ') || 'Unnamed invitation';
                const url = invitationUrl(invitation);
                return (
                  <div
                    key={invitation.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/invitations/${invitation.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        navigate(`/invitations/${invitation.id}`);
                      }
                    }}
                    className="w-full rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-brand-200 hover:bg-brand-50/30"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-gray-900">{couple}</p>
                        {isAdmin && <p className="mt-1 font-mono text-xs text-gray-500">{invitation.invitation_code}</p>}
                      </div>
                      <StatusBadge status={invitation.status} />
                    </div>
                    <div className="mt-3 border-t border-gray-100 pt-3 text-sm">
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Design</p>
                      <p className="mt-1 text-gray-700">{invitation.design?.design_name || '—'}</p>
                      {isAdmin && (
                        <>
                          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-gray-400">Shop</p>
                          <p className="mt-1 text-gray-700">{invitation.shop?.shop_name || '—'}</p>
                        </>
                      )}
                    </div>
                    {!isAdmin && (
                      <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
                        {url && (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(event) => event.stopPropagation()}
                            className="inline-flex min-w-0 flex-1 items-center justify-center gap-1 rounded-lg border border-brand-200 px-3 py-2 text-xs font-medium text-brand-700"
                          >
                            <ExternalLink className="h-3.5 w-3.5 shrink-0" /> Open invite
                          </a>
                        )}
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(event) => { event.stopPropagation(); setQrInvitation(invitation); }}
                          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); setQrInvitation(invitation); } }}
                          className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700"
                        >
                          <QrCode className="h-3.5 w-3.5" /> View QR
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Card>

      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Badge variant="neutral">{filtered.length} invitations</Badge>
      </div>

      <Modal
        open={!!qrInvitation}
        onClose={() => { setQrInvitation(null); setQrImage(null); setQrError(''); }}
        title="Invitation QR Code"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={downloadQr} disabled={!qrImage}>
              <Download className="h-4 w-4" />
              Download image
            </Button>
            <Button onClick={shareQr} disabled={!qrImage}>
              <Share2 className="h-4 w-4" />
              Share QR image
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-center">
          <p className="text-sm font-medium text-gray-900">
            {qrInvitation && [qrInvitation.groom_name, qrInvitation.bride_name].filter(Boolean).join(' & ')}
          </p>
          {qrImage ? (
            <img src={qrImage} alt="Invitation QR code" className="mx-auto h-72 w-72 rounded-lg border border-gray-200 bg-white p-2" />
          ) : (
            <div className="flex h-72 items-center justify-center text-sm text-gray-500">{qrError || 'Generating QR image...'}</div>
          )}
          <p className="text-xs text-gray-500">
            Share sends the QR PNG image through your device share menu, including WhatsApp when it is available.
          </p>
          {qrError && qrImage && <p className="text-xs text-warning-700">{qrError}</p>}
        </div>
      </Modal>
    </div>
  );
}
