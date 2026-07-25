import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI crash caught:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
          <div className="mb-6 grid h-20 w-20 place-items-center rounded-2xl bg-danger-500/10 border border-danger-500/20">
            <svg className="h-10 w-10 text-danger-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          </div>
          <h1 className="mb-2 text-2xl font-extrabold text-slate-100">حدث خطأ غير متوقع</h1>
          <p className="mb-6 max-w-md text-slate-400">
            واجه التطبيق مشكلة أثناء عرض هذه الصفحة. يمكنك تحديث الصفحة للمحاولة مرة أخرى.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="btn-primary"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992V4.356M19.677 19.677A9 9 0 1 1 6.222 6.222s4.992 3.725 9.8 1.129" />
            </svg>
            تحديث الصفحة
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
