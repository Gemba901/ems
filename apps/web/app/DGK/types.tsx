export interface KaizenEntry {
  id: string;
  title: string;
  description: string;
  status: 'In Progress' | 'Verification' | 'Verified' | 'Draft';
  createdBy: string;
  department: string;
  createdAt: string;
  imageUrl: string;
}

export interface SummaryData {
  myKaizens: number;
  inProgress: number;
  pendingVerification: number;
  verifiedThisMonth: number;
  verifiedTrend: string;
}