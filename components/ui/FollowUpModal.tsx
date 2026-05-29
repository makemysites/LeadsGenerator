'use client';

import { useState } from 'react';
import { useToast } from './Toast';
import styles from './FollowUpModal.module.css';

interface FollowUpModalProps {
  leadId: string;
  doctorName: string;
  existingNote?: string | null;
  existingDatetime?: string | null;
  onClose: () => void;
  onSaved: (leadId: string, followUpDatetime: string, followUpNote: string) => void;
}

function getTodayStr(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export default function FollowUpModal({
  leadId,
  doctorName,
  existingNote,
  existingDatetime,
  onClose,
  onSaved,
}: FollowUpModalProps) {
  const { showToast } = useToast();
  const defaultDate = existingDatetime ? existingDatetime.slice(0, 10) : getTodayStr();
  const defaultTime = existingDatetime ? existingDatetime.slice(11, 16) : '18:00';

  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState(defaultTime);
  const [note, setNote] = useState(existingNote || '');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!date || !time) {
      showToast('Please select a date and time', 'error');
      return;
    }
    setSaving(true);
    const followUpDatetime = `${date}T${time}:00`;
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'follow_up',
          follow_up_datetime: followUpDatetime,
          follow_up_note: note || null,
        }),
      });
      if (!res.ok) throw new Error('Failed to save');
      onSaved(leadId, followUpDatetime, note);
      showToast('Follow-up scheduled!', 'success');
      onClose();
    } catch {
      showToast('Failed to schedule follow-up', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.title}>Schedule Follow-Up Call</div>
        <div className={styles.subtitle}>
          For <span className={styles.doctorName}>{doctorName}</span>
        </div>
        <div className={styles.row}>
          <div className={styles.formGroup}>
            <label className={styles.label}>Date</label>
            <input
              type="date"
              className="input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              min={getTodayStr()}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>Time</label>
            <input
              type="time"
              className="input"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>What did the doctor say?</label>
          <textarea
            className="textarea"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Notes about the conversation..."
          />
        </div>
        <div className={styles.actions}>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn btn-warning" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : '⏰ Schedule'}
          </button>
        </div>
      </div>
    </div>
  );
}
