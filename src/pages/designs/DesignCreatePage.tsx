import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/ui/Toast';
import { logAuditEvent } from '@/lib/audit';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { PageHeader } from '@/components/ui/PageHeader';

export function DesignCreatePage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    design_name: '',
    design_code: '',
    production_url: '',
    description: '',
    status: 'active' as 'active' | 'inactive',
  });

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.design_name.trim()) e.design_name = 'Design name is required';
    if (!['design_01', 'design_02', 'design_03', 'design_04', 'design_05', 'design_06', 'design_07', 'design_08', 'design_09', 'design_10','design_11'].includes(form.design_code))
      e.design_code = 'Select one of the supported design codes.';
    if (!form.production_url.trim()) e.production_url = 'Production URL is required';
    else if (!/^https?:\/\/.+/.test(form.production_url.trim()))
      e.production_url = 'Must be a valid URL (starting with http:// or https://)';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from('designs')
        .insert({
          design_name: form.design_name.trim(),
          design_code: form.design_code,
          production_url: form.production_url.trim(),
          description: form.description.trim() || null,
          status: form.status,
        })
        .select()
        .single();

      if (error) throw error;

      await logAuditEvent({
        action: 'Admin registered Design',
        design_id: data.id,
        metadata: { design_name: form.design_name, design_code: form.design_code, production_url: form.production_url },
      });

      toast('Design registered successfully.', 'success');
      navigate(`/designs/${data.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to register design';
      if (msg.includes('duplicate') || msg.includes('unique')) {
        setErrors({ design_code: 'A design with this code already exists' });
      } else {
        toast(msg, 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <PageHeader title="Add Design" description="Register an invitation design deployed on Vercel" />

      <div className="mb-4">
        <Link to="/designs" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700">
          <ArrowLeft className="h-4 w-4" />
          Back to designs
        </Link>
      </div>

      <form onSubmit={handleSubmit}>
        <Card className="mb-6">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Design Name"
                required
                value={form.design_name}
                onChange={(e) => {
                  setForm({ ...form, design_name: e.target.value });
                  setErrors({ ...errors, design_name: '' });
                }}
                error={errors.design_name}
                placeholder="e.g. Royal Floral"
              />
              <div>
                <label className="label-base">Design Code *</label>
                <select
                  value={form.design_code}
                  onChange={(e) => { setForm({ ...form, design_code: e.target.value }); setErrors({ ...errors, design_code: '' }); }}
                  className="input-base"
                >
                  <option value="">Select design code...</option>
                  <option value="design_01">design_01</option>
                  <option value="design_02">design_02</option>
                  <option value="design_03">design_03</option>
                  <option value="design_04">design_04</option>
                  <option value="design_05">design_05</option>
                  <option value="design_06">design_06</option>
                  <option value="design_07">design_07</option>
                  <option value="design_08">design_08</option>
                  <option value="design_09">design_09</option>
                  <option value="design_10">design_10</option>
                  <option value="design_11">Design 11</option>
                </select>
                {errors.design_code && <p className="mt-1 text-xs text-error-600">{errors.design_code}</p>}
                <p className="mt-1 text-xs text-gray-500">Fixed securely to the corresponding invitation table.</p>
              </div>
            </div>
            <Input
              label="Production Vercel URL"
              required
              value={form.production_url}
              onChange={(e) => {
                setForm({ ...form, production_url: e.target.value });
                setErrors({ ...errors, production_url: '' });
              }}
              error={errors.production_url}
              placeholder="https://design-01.vercel.app"
              hint="Enter the final deployed Vercel URL for this design"
            />
            <Textarea
              label="Description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Brief description of the design..."
            />
            <div>
              <label className="label-base">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as 'active' | 'inactive' })}
                className="input-base"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
        </Card>

        <div className="flex items-center justify-end gap-3">
          <Link to="/designs">
            <Button variant="outline" type="button">
              Cancel
            </Button>
          </Link>
          <Button type="submit" loading={loading}>
            {loading ? 'Registering...' : 'Register Design'}
          </Button>
        </div>
      </form>
    </div>
  );
}
