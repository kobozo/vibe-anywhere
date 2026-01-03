/**
 * Ring buffer for output storage
 * Stores terminal output per tab with fixed size limit
 */

export class RingBuffer<T> {
  private buffer: T[];
  private head: number = 0;
  private tail: number = 0;
  private count: number = 0;

  constructor(private readonly capacity: number) {
    this.buffer = new Array(capacity);
  }

  push(item: T): void {
    this.buffer[this.tail] = item;
    this.tail = (this.tail + 1) % this.capacity;

    if (this.count < this.capacity) {
      this.count++;
    } else {
      // Buffer is full, move head forward (overwrite oldest)
      this.head = (this.head + 1) % this.capacity;
    }
  }

  getAll(): T[] {
    const result: T[] = [];
    let index = this.head;
    for (let i = 0; i < this.count; i++) {
      result.push(this.buffer[index]);
      index = (index + 1) % this.capacity;
    }
    return result;
  }

  getRecent(n: number): T[] {
    const all = this.getAll();
    return all.slice(-n);
  }

  size(): number {
    return this.count;
  }

  clear(): void {
    this.head = 0;
    this.tail = 0;
    this.count = 0;
  }
}

/**
 * Output buffer manager for multiple tabs
 */
export class OutputBufferManager {
  private buffers: Map<string, RingBuffer<string>> = new Map();

  constructor(private readonly bufferSize: number) {}

  /**
   * Append output to a tab's buffer
   */
  append(tabId: string, data: string): void {
    let buffer = this.buffers.get(tabId);
    if (!buffer) {
      buffer = new RingBuffer<string>(this.bufferSize);
      this.buffers.set(tabId, buffer);
    }

    // Split by newlines and store each line separately
    const lines = data.split('\n');
    for (const line of lines) {
      if (line.length > 0) {
        buffer.push(line);
      }
    }
  }

  /**
   * Get recent output from a tab's buffer
   */
  getRecent(tabId: string, lines: number): string[] {
    const buffer = this.buffers.get(tabId);
    return buffer ? buffer.getRecent(lines) : [];
  }

  /**
   * Get all output from a tab's buffer
   */
  getAll(tabId: string): string[] {
    const buffer = this.buffers.get(tabId);
    return buffer ? buffer.getAll() : [];
  }

  /**
   * Clear a tab's buffer
   */
  clear(tabId: string): void {
    this.buffers.delete(tabId);
  }

  /**
   * Check if a tab has a buffer
   */
  has(tabId: string): boolean {
    return this.buffers.has(tabId);
  }
}
