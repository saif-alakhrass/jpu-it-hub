/**
 * Performance monitoring utilities for tracking application performance
 */

export interface PerformanceMetric {
  name: string;
  duration: number;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private readonly maxMetrics = 100;

  startMeasure(name: string, metadata?: Record<string, unknown>): number {
    return performance.now();
  }

  endMeasure(name: string, startTime: number, metadata?: Record<string, unknown>): PerformanceMetric {
    const duration = performance.now() - startTime;
    const metric: PerformanceMetric = {
      name,
      duration,
      timestamp: Date.now(),
      metadata,
    };

    this.addMetric(metric);
    return metric;
  }

  addMetric(metric: PerformanceMetric): void {
    this.metrics.push(metric);
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift();
    }
  }

  getMetrics(): PerformanceMetric[] {
    return [...this.metrics];
  }

  getMetricsByName(name: string): PerformanceMetric[] {
    return this.metrics.filter(m => m.name === name);
  }

  getAverageDuration(name: string): number {
    const metrics = this.getMetricsByName(name);
    if (metrics.length === 0) return 0;
    const total = metrics.reduce((sum, m) => sum + m.duration, 0);
    return total / metrics.length;
  }

  clearMetrics(): void {
    this.metrics = [];
  }

  // Get Web Vitals
  getWebVitals(): {
    FCP?: number;
    LCP?: number;
    CLS?: number;
    FID?: number;
    TTFB?: number;
  } {
    const vitals: Record<string, number> = {};

    if ('PerformanceObserver' in window) {
      try {
        // First Contentful Paint
        const fcpEntries = performance.getEntriesByName('first-contentful-paint');
        if (fcpEntries.length > 0) {
          vitals.FCP = fcpEntries[0].startTime;
        }

        // Largest Contentful Paint
        const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
        if (lcpEntries.length > 0) {
          vitals.LCP = lcpEntries[lcpEntries.length - 1].startTime;
        }

        // Cumulative Layout Shift
        const clsEntries = performance.getEntriesByType('layout-shift');
        if (clsEntries.length > 0) {
          vitals.CLS = clsEntries.reduce((sum, entry) => {
            return sum + (entry as any).value;
          }, 0);
        }

        // First Input Delay
        const fidEntries = performance.getEntriesByType('first-input');
        if (fidEntries.length > 0) {
          vitals.FID = (fidEntries[0] as any).processingStart - (fidEntries[0] as any).startTime;
        }

        // Time to First Byte
        const navigationEntries = performance.getEntriesByType('navigation');
        if (navigationEntries.length > 0) {
          const navEntry = navigationEntries[0] as PerformanceNavigationTiming;
          vitals.TTFB = navEntry.responseStart - navEntry.requestStart;
        }
      } catch (error) {
        console.warn('Error collecting web vitals:', error);
      }
    }

    return vitals;
  }
}

// Singleton instance
export const performanceMonitor = new PerformanceMonitor();

// Utility function to measure async operations
export async function measureAsync<T>(
  name: string,
  fn: () => Promise<T>,
  metadata?: Record<string, unknown>
): Promise<T> {
  const startTime = performance.now();
  try {
    const result = await fn();
    performanceMonitor.endMeasure(name, startTime, { ...metadata, success: true });
    return result;
  } catch (error) {
    performanceMonitor.endMeasure(name, startTime, { 
      ...metadata, 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    throw error;
  }
}

// Utility function to measure sync operations
export function measureSync<T>(
  name: string,
  fn: () => T,
  metadata?: Record<string, unknown>
): T {
  const startTime = performance.now();
  try {
    const result = fn();
    performanceMonitor.endMeasure(name, startTime, { ...metadata, success: true });
    return result;
  } catch (error) {
    performanceMonitor.endMeasure(name, startTime, { 
      ...metadata, 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    throw error;
  }
}