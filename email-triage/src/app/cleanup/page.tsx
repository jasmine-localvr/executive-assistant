import CleanupDashboard from '@/components/CleanupDashboard';

export default function CleanupPage() {
  return (
    <div>
      <h1 className="mb-2 font-serif text-[32px] text-charcoal">Inbox Cleanup</h1>
      <p className="mb-6 text-sm text-medium-gray">
        Blast through old unread emails. T1/T2/T3 auto-archive. T4 appears below for your review.
      </p>
      <CleanupDashboard />
    </div>
  );
}
