'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { api } from '@/lib/api';
import { EMPLOYMENT_TYPES, HiringForm, HiringLocation, HiringTemplate } from '@/lib/hiring';

export function CreateFormModal({
  open,
  onClose,
  locations,
  templates,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  locations: HiringLocation[];
  templates: HiringTemplate[];
  onCreated: (form: HiringForm) => void;
}) {
  const [title, setTitle] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [employmentType, setEmploymentType] = useState('FULL_TIME');
  const [openings, setOpenings] = useState('1');
  const [qualification, setQualification] = useState('');
  const [experienceLevel, setExperienceLevel] = useState('');
  const [salaryMin, setSalaryMin] = useState('');
  const [salaryMax, setSalaryMax] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [templateSlug, setTemplateSlug] = useState('');
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);
  const [allowOtherLocations, setAllowOtherLocations] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && selectedLocationIds.length === 0) {
      setSelectedLocationIds(locations.map((l) => l.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, locations]);

  const reset = () => {
    setTitle('');
    setJobTitle('');
    setEmploymentType('FULL_TIME');
    setOpenings('1');
    setQualification('');
    setExperienceLevel('');
    setSalaryMin('');
    setSalaryMax('');
    setJobDescription('');
    setTemplateSlug('');
    setSelectedLocationIds(locations.map((l) => l.id));
    setAllowOtherLocations(false);
  };

  const toggleLocation = (id: string) => {
    setSelectedLocationIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Give the opening a title');
      return;
    }
    if (selectedLocationIds.length === 0 && !allowOtherLocations) {
      toast.error('Select at least one hiring location');
      return;
    }
    setSaving(true);
    try {
      const res = await api.post('/hiring/forms', {
        title: title.trim(),
        jobTitle: jobTitle.trim() || title.trim(),
        employmentType,
        openings: Number(openings) || 1,
        qualification: qualification.trim() || null,
        experienceLevel: experienceLevel.trim() || null,
        salaryMin: salaryMin ? Number(salaryMin) : null,
        salaryMax: salaryMax ? Number(salaryMax) : null,
        jobDescription: jobDescription.trim() || null,
        templateSlug: templateSlug || null,
        locationIds: selectedLocationIds,
        allowOtherLocations,
      });
      toast.success('Job opening created');
      reset();
      onCreated(res.data);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to create the opening');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New job opening" className="max-w-2xl">
      <form onSubmit={submit} className="space-y-4 text-xs">
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Opening title *"
            placeholder="e.g. Store Sales Associate"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Input
            label="Job title shown to candidates"
            placeholder="Defaults to the opening title"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Select
            label="Employment type"
            value={employmentType}
            onChange={(e) => setEmploymentType(e.target.value)}
            options={EMPLOYMENT_TYPES}
          />
          <Input
            label="Openings"
            type="number"
            min={1}
            value={openings}
            onChange={(e) => setOpenings(e.target.value)}
          />
          <Select
            label="Start from template"
            value={templateSlug}
            onChange={(e) => setTemplateSlug(e.target.value)}
            options={[
              { value: '', label: 'Minimal form (name, phone…)' },
              ...templates.map((t) => ({ value: t.slug, label: t.name })),
            ]}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Qualification"
            placeholder="e.g. PUC / 10th Pass"
            value={qualification}
            onChange={(e) => setQualification(e.target.value)}
          />
          <Input
            label="Experience level"
            placeholder="e.g. Fresher / 0-2 years"
            value={experienceLevel}
            onChange={(e) => setExperienceLevel(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Monthly salary — min (₹)"
            type="number"
            min={0}
            value={salaryMin}
            onChange={(e) => setSalaryMin(e.target.value)}
          />
          <Input
            label="Monthly salary — max (₹)"
            type="number"
            min={0}
            value={salaryMax}
            onChange={(e) => setSalaryMax(e.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">Job description</label>
          <textarea
            rows={3}
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            placeholder="What the role involves — shown on the public application page."
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[#1346a1] focus:outline-none focus:ring-1 focus:ring-[#1346a1] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>

        <div>
          <p className="mb-1.5 text-sm font-medium text-gray-700 dark:text-slate-200">Hiring locations *</p>
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700 sm:grid-cols-3">
            {locations.map((loc) => (
              <label key={loc.id} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={selectedLocationIds.includes(loc.id)}
                  onChange={() => toggleLocation(loc.id)}
                  className="h-4 w-4 rounded border-gray-300 text-[#1346a1] focus:ring-[#1346a1]"
                />
                <span className="truncate">{loc.code} — {loc.name}</span>
              </label>
            ))}
            {locations.length === 0 && <p className="text-slate-400">No locations have hiring enabled.</p>}
          </div>
          <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              checked={allowOtherLocations}
              onChange={(e) => setAllowOtherLocations(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-[#1346a1] focus:ring-[#1346a1]"
            />
            Also accept candidates for other hiring-enabled locations
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>Create opening</Button>
        </div>
      </form>
    </Modal>
  );
}

export default CreateFormModal;
