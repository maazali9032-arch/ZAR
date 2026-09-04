import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Pencil, Ban, CheckCircle2, Mail, Phone, MapPin, MessageCircle, Building, Plus, UserPlus, UserMinus, Shield } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { logAuditEvent } from '@/lib/audit';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { Table } from '@/components/ui/Table';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { createShopOwner, changeUserRole, revokeShopOwnerAccess, listShopOwnerProfiles } from '@/services/userService';
import type { Shop, Design, ShopDesignAssignment, Invitation, AdminProfile, UserRole } from '@/types';

export function ShopDetailPage() {
  const { shopId } = useParams<{ shopId: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const { toast } = useToast();
  const [shop, setShop] = useState<Shop | null>(null);
  const [allDesigns, setAllDesigns] = useState<Design[]>([]);
  const [assignments, setAssignments] = useState<ShopDesignAssignment[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [ownerProfiles, setOwnerProfiles] = useState<AdminProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [addOwnerOpen, setAddOwnerOpen] = useState(false);
  const [roleConfirmOpen, setRoleConfirmOpen] = useState(false);
  const [revokeConfirmOpen, setRevokeConfirmOpen] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<AdminProfile | null>(null);
  const [pendingRole, setPendingRole] = useState<UserRole>('shop_owner');
  const [actionLoading, setActionLoading] = useState(false);

  const loadData = useCallback(async () => {
    if (!shopId) return;
    try {
      const [shopRes, designsRes, assignmentsRes, invitationsRes, ownersRes] = await Promise.all([
        supabase.from('shops').select('*').eq('id', shopId).maybeSingle(),
        isAdmin ? supabase.from('designs').select('*').order('design_code') : supabase.from('designs').select('*').order('design_code'),
        supabase
          .from('shop_design_assignments')
          .select('*, design:designs(*)')
          .eq('shop_id', shopId),
        supabase
          .from('invitations')
          .select('*, design:designs(design_name, design_code)')
          .eq('shop_id', shopId)
          .order('created_at', { ascending: false }),
        isAdmin ? listShopOwnerProfiles(shopId) : Promise.resolve([]),
      ]);

      if (shopRes.error) throw shopRes.error;
      if (!shopRes.data) {
        setError('Shop not found');
        return;
      }

      setShop(shopRes.data as Shop);
      setAllDesigns((designsRes.data as Design[]) ?? []);
      setAssignments((assignmentsRes.data as ShopDesignAssignment[]) ?? []);
      setInvitations((invitationsRes.data as Invitation[]) ?? []);
      setOwnerProfiles(ownersRes ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load shop');
    } finally {
      setLoading(false);
    }
  }, [shopId, isAdmin]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggleStatus = async () => {
    if (!shop) return;
    setActionLoading(true);
    const newStatus = shop.status === 'active' ? 'disabled' : 'active';
    const { error } = await supabase.from('shops').update({ status: newStatus }).eq('id', shop.id);
    setActionLoading(false);
    setDisableOpen(false);

    if (error) {
      toast(error.message, 'error');
      return;
    }

    await logAuditEvent({
      action: newStatus === 'disabled' ? 'Admin disabled Shop' : 'Admin reactivated Shop',
      shop_id: shop.id,
      metadata: { shop_name: shop.shop_name, previous_status: shop.status, new_status: newStatus },
    });

    toast(`Shop ${newStatus === 'active' ? 'reactivated' : 'disabled'} successfully.`, 'success');
    setShop({ ...shop, status: newStatus });
  };

  const handleToggleAssignment = async (designId: string, currentStatus: string | null) => {
    if (!shop) return;
    setActionLoading(true);

    try {
      if (currentStatus === null) {
        // Create new assignment
        const { error } = await supabase
          .from('shop_design_assignments')
          .insert({ shop_id: shop.id, design_id: designId, status: 'assigned' });
        if (error) throw error;
        await logAuditEvent({
          action: 'Admin assigned Design to Shop',
          shop_id: shop.id,
          design_id: designId,
          metadata: { shop_name: shop.shop_name },
        });
        toast('Design assigned successfully.', 'success');
      } else if (currentStatus === 'assigned') {
        // Restrict
        const { error } = await supabase
          .from('shop_design_assignments')
          .update({ status: 'restricted' })
          .eq('shop_id', shop.id)
          .eq('design_id', designId);
        if (error) throw error;
        await logAuditEvent({
          action: 'Admin restricted Design',
          shop_id: shop.id,
          design_id: designId,
          metadata: { shop_name: shop.shop_name },
        });
        toast('Design restricted.', 'warning');
      } else {
        // Re-assign
        const { error } = await supabase
          .from('shop_design_assignments')
          .update({ status: 'assigned' })
          .eq('shop_id', shop.id)
          .eq('design_id', designId);
        if (error) throw error;
        await logAuditEvent({
          action: 'Admin re-assigned Design to Shop',
          shop_id: shop.id,
          design_id: designId,
          metadata: { shop_name: shop.shop_name },
        });
        toast('Design re-assigned.', 'success');
      }
      await loadData();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to update assignment', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRequestRoleChange = (p: AdminProfile, newRole: UserRole) => {
    setSelectedProfile(p);
    setPendingRole(newRole);
    setRoleConfirmOpen(true);
  };

  const handleConfirmRoleChange = async () => {
    if (!selectedProfile) return;
    setActionLoading(true);
    try {
      await changeUserRole(selectedProfile.id, selectedProfile.user_id, pendingRole, selectedProfile.role);
      toast(`Role changed to ${pendingRole}.`, 'success');
      await loadData();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to change role', 'error');
    } finally {
      setActionLoading(false);
      setRoleConfirmOpen(false);
      setSelectedProfile(null);
    }
  };

  const handleRequestRevoke = (p: AdminProfile) => {
    setSelectedProfile(p);
    setRevokeConfirmOpen(true);
  };

  const handleConfirmRevoke = async () => {
    if (!selectedProfile || !shop) return;
    setActionLoading(true);
    try {
      await revokeShopOwnerAccess(selectedProfile.id, selectedProfile.user_id, shop.id, {
        clearShopId: true,
      });
      toast('Shop owner access revoked.', 'warning');
      await loadData();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to revoke access', 'error');
    } finally {
      setActionLoading(false);
      setRevokeConfirmOpen(false);
      setSelectedProfile(null);
    }
  };

  if (loading) return <LoadingState message="Loading shop..." />;
  if (error) return <ErrorState message={error} onRetry={() => navigate('/shops')} />;
  if (!shop) return <ErrorState message="Shop not found" />;

  const assignmentMap = new Map(assignments.map((a) => [a.design_id, a.status]));

  const invitationColumns = [
    {
      key: 'invitation_code',
      header: 'Code',
      render: (row: Invitation) => <span className="font-mono text-xs">{row.invitation_code}</span>,
    },
    {
      key: 'names',
      header: 'Couple',
      render: (row: Invitation) => (
        <span>{[row.groom_name, row.bride_name].filter(Boolean).join(' & ') || '—'}</span>
      ),
    },
    {
      key: 'slug',
      header: 'Slug',
      hideOnMobile: true,
      render: (row: Invitation) => <span className="font-mono text-xs text-gray-500">{row.slug}</span>,
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

  return (
    <div>
      <div className="mb-4">
        <Link to="/shops" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700">
          <ArrowLeft className="h-4 w-4" />
          Back to shops
        </Link>
      </div>

      <PageHeader
        title={shop.shop_name}
        description={`Owner: ${shop.owner_name}`}
        action={
          isAdmin && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
              <Button
                variant={shop.status === 'active' ? 'danger' : 'primary'}
                onClick={() => setDisableOpen(true)}
              >
                {shop.status === 'active' ? (
                  <>
                    <Ban className="h-4 w-4" />
                    Disable
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Reactivate
                  </>
                )}
              </Button>
            </div>
          )
        }
      />

      <div className="mb-4 flex items-center gap-2">
        <StatusBadge status={shop.status} />
        <span className="text-sm text-gray-400">Created {new Date(shop.created_at).toLocaleDateString()}</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Shop Information" />
          <div className="mt-4 space-y-3">
            <InfoRow icon={Building} label="Business Contact" value={shop.business_contact} />
            <InfoRow icon={Mail} label="Owner Email" value={shop.owner_email} />
            <InfoRow icon={Phone} label="Phone" value={shop.phone} />
            <InfoRow icon={MessageCircle} label="WhatsApp" value={shop.whatsapp} />
            <InfoRow icon={MapPin} label="Address" value={[shop.address, shop.city, shop.state, shop.country].filter(Boolean).join(', ')} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Shared Platform Access" />
          <div className="mt-4 rounded-lg bg-brand-50 border border-brand-100 px-3 py-3 text-xs text-brand-800">This shop uses the central ZAR Supabase project. Access is isolated by authentication, shop ownership, design assignments, and database RLS; no per-shop credentials exist.</div>
        </Card>
      </div>

      {/* Assigned Designs */}
      <Card className="mt-6">
        <CardHeader
          title="Assigned Designs"
          subtitle="Manage which designs this shop can access"
          action={
            isAdmin && (
              <Button size="sm" onClick={() => setAssignOpen(true)}>
                <Plus className="h-4 w-4" />
                Manage
              </Button>
            )
          }
        />
        <div className="mt-4">
          {allDesigns.length === 0 ? (
            <EmptyState title="No designs registered" description="Register designs first, then assign them to this shop." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {allDesigns.map((design) => {
                const status = assignmentMap.get(design.id) ?? null;
                return (
                  <div
                    key={design.id}
                    className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
                      status === 'assigned'
                        ? 'border-success-200 bg-success-50/50'
                        : status === 'restricted'
                        ? 'border-warning-200 bg-warning-50/50'
                        : 'border-gray-200 bg-gray-50/50'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">{design.design_name}</p>
                      <p className="text-xs text-gray-500">{design.design_code}</p>
                    </div>
                    {status === 'assigned' && <Badge variant="success">Assigned</Badge>}
                    {status === 'restricted' && <Badge variant="warning">Restricted</Badge>}
                    {status === null && <Badge variant="neutral">Not Assigned</Badge>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      {/* Invitations */}
      <Card className="mt-6" padding="none">
        <div className="border-b border-gray-100 p-5">
          <h3 className="text-base font-semibold text-gray-900">Invitation Overview</h3>
        </div>
        {invitations.length === 0 ? (
          <div className="p-5">
            <EmptyState title="No invitations yet" description="Invitations created by this shop owner will appear here." />
          </div>
        ) : (
          <Table
            columns={invitationColumns}
            data={invitations}
            onRowClick={(row) => navigate(`/invitations/${row.id}`)}
          />
        )}
      </Card>

      {/* Shop Owner Users (Admin only) */}
      {isAdmin && (
        <Card className="mt-6">
          <CardHeader
            title="Shop Owner Account"
            subtitle="The login account created when this shop was added"
          />
          <div className="mt-4">
            {ownerProfiles.length === 0 ? (
              <EmptyState
                title="No shop-owner account"
                description="This shop was created without an owner account. Create the shop again with the owner login details."
              />
            ) : (
              <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                {ownerProfiles.map((p) => (
                  <div key={p.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
                        {(p.full_name || '?')[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">{p.full_name || 'Unnamed User'}</p>
                        <p className="text-xs text-gray-500">User ID: <span className="font-mono">{p.user_id.slice(0, 8)}…</span></p>
                      </div>
                      <Badge variant={p.role === 'admin' ? 'brand' : 'neutral'}>
                        {p.role === 'admin' ? 'Administrator' : 'Shop Owner'}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          handleRequestRoleChange(p, p.role === 'admin' ? 'shop_owner' : 'admin')
                        }
                      >
                        <Shield className="h-3.5 w-3.5" />
                        {p.role === 'admin' ? 'Demote to Owner' : 'Promote to Admin'}
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => handleRequestRevoke(p)}
                      >
                        <UserMinus className="h-3.5 w-3.5" />
                        Revoke Access
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Disable/Reactivate Modal */}
      <Modal
        open={disableOpen}
        onClose={() => setDisableOpen(false)}
        title={shop.status === 'active' ? 'Disable Shop' : 'Reactivate Shop'}
        footer={
          <>
            <Button variant="outline" onClick={() => setDisableOpen(false)}>
              Cancel
            </Button>
            <Button
              variant={shop.status === 'active' ? 'danger' : 'primary'}
              loading={actionLoading}
              onClick={handleToggleStatus}
            >
              {shop.status === 'active' ? 'Disable' : 'Reactivate'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          {shop.status === 'active'
            ? `Disabling "${shop.shop_name}" will prevent the shop owner from accessing the platform. Existing invitation URLs will continue to work. You can reactivate the shop at any time.`
            : `Reactivating "${shop.shop_name}" will restore the shop owner's access to the platform.`}
        </p>
      </Modal>

      {/* Assignment Management Modal */}
      <Modal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title="Manage Design Assignments"
        size="lg"
        footer={
          <Button variant="outline" onClick={() => setAssignOpen(false)}>
            Done
          </Button>
        }
      >
        <div className="space-y-2">
          {allDesigns.map((design) => {
            const status = assignmentMap.get(design.id) ?? null;
            return (
              <div
                key={design.id}
                className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">{design.design_name}</p>
                  <p className="text-xs text-gray-500">{design.design_code}</p>
                </div>
                <div className="flex items-center gap-2">
                  {status === 'assigned' && <Badge variant="success">Assigned</Badge>}
                  {status === 'restricted' && <Badge variant="warning">Restricted</Badge>}
                  {status === null && <Badge variant="neutral">Not Assigned</Badge>}
                  <Button
                    size="sm"
                    variant={status === 'assigned' ? 'danger' : 'outline'}
                    loading={actionLoading}
                    onClick={() => handleToggleAssignment(design.id, status)}
                  >
                    {status === 'assigned' ? 'Restrict' : status === 'restricted' ? 'Re-assign' : 'Assign'}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </Modal>

      {/* Role Change Confirmation Modal */}
      <Modal
        open={roleConfirmOpen}
        onClose={() => setRoleConfirmOpen(false)}
        title={pendingRole === 'admin' ? 'Promote to Administrator' : 'Demote to Shop Owner'}
        footer={
          <>
            <Button variant="outline" onClick={() => setRoleConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant={pendingRole === 'admin' ? 'danger' : 'primary'}
              loading={actionLoading}
              onClick={handleConfirmRoleChange}
            >
              Confirm {pendingRole === 'admin' ? 'Promote' : 'Demote'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          Are you sure you want to change the role of{' '}
          <strong>{selectedProfile?.full_name || 'this user'}</strong> from{' '}
          <strong>{selectedProfile?.role}</strong> to{' '}
          <strong>{pendingRole}</strong>?
          {pendingRole === 'admin' && (
            <span className="mt-2 block rounded-lg border border-error-200 bg-error-50 p-2 text-xs text-error-700">
              Warning: Promoting a user to admin grants access to all shops, designs, invitations, and audit logs across the platform.
            </span>
          )}
        </p>
      </Modal>

      {/* Revoke Access Confirmation Modal */}
      <Modal
        open={revokeConfirmOpen}
        onClose={() => setRevokeConfirmOpen(false)}
        title="Revoke Shop Owner Access"
        footer={
          <>
            <Button variant="outline" onClick={() => setRevokeConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={actionLoading} onClick={handleConfirmRevoke}>
              Revoke Access
            </Button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          Are you sure you want to revoke access for{' '}
          <strong>{selectedProfile?.full_name || 'this user'}</strong>?
          Their account will be unlinked from this shop (shop_id cleared).
          They will no longer be able to manage invitations for this shop.
        </p>
      </Modal>

      {/* Create Shop Owner Modal */}
      <CreateShopOwnerModal
        open={addOwnerOpen}
        onClose={() => setAddOwnerOpen(false)}
        shop={shop}
        onCreated={() => {
          setAddOwnerOpen(false);
          loadData();
        }}
      />

      {/* Edit Modal */}
      <EditShopModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        shop={shop}
        onSaved={() => {
          setEditOpen(false);
          loadData();
        }}
      />
    </div>
  );
}

function CreateShopOwnerModal({
  open,
  onClose,
  shop,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  shop: Shop;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ email: '', full_name: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setForm({ email: '', full_name: '', password: '' });
      setErrors({});
    }
  }, [open]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.email.trim()) e.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Invalid email format';
    if (!form.full_name.trim()) e.full_name = 'Full name is required';
    if (form.password.length < 8) e.password = 'Password must be at least 8 characters';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      const result = await createShopOwner({
        email: form.email.trim(),
        full_name: form.full_name.trim(),
        password: form.password.trim() || undefined,
        shop_id: shop.id,
      });

      const methodMsg =
        result.method === 'signup'
          ? 'Account created and ready to sign in.'
          : result.method === 'reset_flow'
          ? 'Password reset email sent — the owner will set their password via the emailed link.'
          : 'Profile recorded. Please use the Supabase dashboard to invite this user and confirm signup.';

      toast(`Shop owner added. ${methodMsg}`, 'success');
      onCreated();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create shop owner';
      if (msg.includes('duplicate') || msg.includes('unique') || msg.includes('already registered')) {
        setErrors({ email: 'This email is already registered. Consider using "Reset password" flow instead.' });
      } else {
        toast(msg, 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add Shop Owner"
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={loading} onClick={handleSubmit}>
            {loading ? 'Creating...' : 'Add Shop Owner'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-brand-200 bg-brand-50/50 p-3 text-xs text-brand-700">
          Adding owner for shop: <strong>{shop.shop_name}</strong>. This creates the login account,
          profile, and shop assignment together in the shared Supabase project.
        </div>
        <Input
          label="Owner Email"
          type="email"
          required
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          error={errors.email}
          placeholder="owner@example.com"
        />
        <Input
          label="Owner Full Name"
          required
          value={form.full_name}
          onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          error={errors.full_name}
          placeholder="Full name of the shop owner"
        />
        <Input
          label="Initial Login Password"
          type="password"
          required
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          error={errors.password}
          placeholder="At least 8 characters"
          hint="The shop owner will use this email and password to sign in."
        />
      </div>
    </Modal>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon?: typeof Mail; label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-start gap-3">
      {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />}
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-sm text-gray-900 break-words">{value || '—'}</p>
      </div>
    </div>
  );
}

function EditShopModal({
  open,
  onClose,
  shop,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  shop: Shop;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    shop_name: shop.shop_name,
    owner_name: shop.owner_name,
    owner_email: shop.owner_email,
    phone: shop.phone || '',
    whatsapp: shop.whatsapp || '',
    address: shop.address || '',
    city: shop.city || '',
    state: shop.state || '',
    country: shop.country || '',
    business_contact: shop.business_contact || '',
  });

  const handleSave = async () => {
    setLoading(true);
    const { error } = await supabase
      .from('shops')
      .update({
        shop_name: form.shop_name.trim(),
        owner_name: form.owner_name.trim(),
        owner_email: form.owner_email.trim(),
        phone: form.phone.trim() || null,
        whatsapp: form.whatsapp.trim() || null,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        country: form.country.trim() || null,
        business_contact: form.business_contact.trim() || null,
      })
      .eq('id', shop.id);

    setLoading(false);

    if (error) {
      toast(error.message, 'error');
      return;
    }

    await logAuditEvent({
      action: 'Admin edited Shop',
      shop_id: shop.id,
      metadata: { shop_name: form.shop_name },
    });

    toast('Shop updated successfully.', 'success');
    onSaved();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit Shop"
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={loading} onClick={handleSave}>
            Save Changes
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Shop Name"
            required
            value={form.shop_name}
            onChange={(e) => setForm({ ...form, shop_name: e.target.value })}
          />
          <Input
            label="Owner Name"
            required
            value={form.owner_name}
            onChange={(e) => setForm({ ...form, owner_name: e.target.value })}
          />
          <Input
            label="Owner Email"
            type="email"
            required
            value={form.owner_email}
            onChange={(e) => setForm({ ...form, owner_email: e.target.value })}
          />
          <Input
            label="Business Contact"
            value={form.business_contact}
            onChange={(e) => setForm({ ...form, business_contact: e.target.value })}
          />
          <Input
            label="Phone"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <Input
            label="WhatsApp"
            value={form.whatsapp}
            onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
          />
          <Input
            label="City"
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
          />
          <Input
            label="State"
            value={form.state}
            onChange={(e) => setForm({ ...form, state: e.target.value })}
          />
          <Input
            label="Country"
            value={form.country}
            onChange={(e) => setForm({ ...form, country: e.target.value })}
          />
        </div>
        <Textarea
          label="Address"
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
        />
      </div>
    </Modal>
  );
}
