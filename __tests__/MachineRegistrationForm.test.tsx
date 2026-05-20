jest.mock('../supabaseClient', () => ({ supabase: null }));
jest.mock('../utils/imageUtils', () => ({
  compressAndResizeImage: jest.fn(),
}));
// ToastContext: override useToast but keep ToastProvider from original module
const toastMock = { showToast: jest.fn() };
jest.mock('../contexts/ToastContext', () => ({
  ...jest.requireActual('../contexts/ToastContext'),
  useToast: () => toastMock,
}));

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import MachineRegistrationForm from '../components/MachineRegistrationForm';
import { compressAndResizeImage } from '../utils/imageUtils';
import { normalizeMachineId } from '../utils/locationWorkflow';

import { makeDriver, makeLocation } from './helpers/fixtures';
import { renderWithProviders } from './helpers/test-utils';

// ─── Mocks ────────────────────────────────────────────────────────────────

const mockShowToast = toastMock.showToast;
const mockCompress = compressAndResizeImage as jest.MockedFunction<typeof compressAndResizeImage>;
const mockOnSubmit = jest.fn<() => Promise<void>>();
const mockOnCancel = jest.fn();
const mockOnSuccessDone = jest.fn();

const driver = makeDriver({ id: 'drv-1', username: 'd@t.com' });
const existingMachineIds = ['M-001', 'M-002'];

// Stub geolocation
const geolocationStub = {
  getCurrentPosition: jest.fn(),
  watchPosition: jest.fn(),
  clearWatch: jest.fn(),
};

function setupGeolocation(available: boolean) {
  if (available) {
    Object.defineProperty(globalThis.navigator, 'geolocation', {
      value: geolocationStub,
      writable: true,
      configurable: true,
    });
  } else {
    Object.defineProperty(globalThis.navigator, 'geolocation', {
      value: undefined,
      writable: true,
      configurable: true,
    });
  }
}

// ─── Render helper ─────────────────────────────────────────────────────────

interface FormOptions {
  existingMachineIds?: string[];
  lang?: 'zh' | 'sw';
  successDoneLabel?: string;
}

function renderForm(opts: FormOptions = {}) {
  return renderWithProviders(
    <MachineRegistrationForm
      onSubmit={mockOnSubmit}
      onCancel={mockOnCancel}
      currentDriver={driver as any}
      lang={opts.lang ?? 'zh'}
      existingMachineIds={opts.existingMachineIds ?? existingMachineIds}
      onSuccessDone={opts.successDoneLabel ? mockOnSuccessDone : undefined}
      successDoneLabel={opts.successDoneLabel}
    />,
    {
      auth: {
        currentUser: { id: 'u1', role: 'admin', name: 'Admin', driverId: 'drv-1' } as any,
        userRole: 'admin',
      },
    },
  );
}

// GPS success position
const gpsPosition = {
  coords: { latitude: -6.82349, longitude: 39.26951, accuracy: 10, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
  timestamp: Date.now(),
};

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('MachineRegistrationForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    // Default: geolocation available
    setupGeolocation(true);
    geolocationStub.getCurrentPosition.mockImplementation((success: any) => {
      success(gpsPosition);
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── TC 1: Renders form ──────────────────────────────────────────────

  it('renders the registration form with all required fields', () => {
    renderForm();
    expect(screen.getByText(/新机入网注册|Sajili Mashine Mpya/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('M-00X')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Shop Name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Owner Name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Kariakoo')).toBeInTheDocument();
    expect(screen.getByText(/完成注册|Hifadhi Sasa/)).toBeInTheDocument();
  });

  // ── TC 2: Commission rate defaults to 15 ────────────────────────────

  it('defaults commission rate to 15', () => {
    renderForm();
    const commInput = screen.getByDisplayValue('15');
    expect(commInput).toBeInTheDocument();
  });

  // ── TC 3: Validates required fields ─────────────────────────────────

  it('shows validation toast when required fields are missing', async () => {
    renderForm();
    fireEvent.click(screen.getByText(/完成注册|Hifadhi Sasa/));
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.stringContaining('请填写所有带 * 的必填项'),
      'warning',
    );
    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  // ── TC 4: Rejects duplicate machine ID ──────────────────────────────

  it('rejects submission when machine ID already exists', async () => {
    renderForm();
    // Fill machine ID with an existing one
    fireEvent.change(screen.getByPlaceholderText('M-00X'), { target: { value: 'M-001' } });
    fireEvent.change(screen.getByPlaceholderText('Shop Name'), { target: { value: 'Test Shop' } });
    fireEvent.change(screen.getByPlaceholderText('Owner Name'), { target: { value: 'Test Owner' } });
    fireEvent.change(screen.getByPlaceholderText('Kariakoo'), { target: { value: 'Kariakoo' } });
    // Simulate GPS already set
    geolocationStub.getCurrentPosition.mockImplementation((success: any) => {
      success(gpsPosition);
    });
    fireEvent.click(screen.getByText('Get GPS'));

    fireEvent.click(screen.getByText(/完成注册|Hifadhi Sasa/));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('M-001'),
        'error',
      );
    });
  });

  // ── TC 5: Requires GPS ──────────────────────────────────────────────

  it('requires GPS before submission', () => {
    renderForm();
    // Fill required text fields but leave GPS unset
    fireEvent.change(screen.getByPlaceholderText('M-00X'), { target: { value: 'M-999' } });
    fireEvent.change(screen.getByPlaceholderText('Shop Name'), { target: { value: 'Test Shop' } });
    fireEvent.change(screen.getByPlaceholderText('Owner Name'), { target: { value: 'Test Owner' } });
    fireEvent.change(screen.getByPlaceholderText('Kariakoo'), { target: { value: 'Kariakoo' } });

    fireEvent.click(screen.getByText(/完成注册|Hifadhi Sasa/));
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.stringContaining('GPS'),
      'warning',
    );
  });

  // ── TC 6: Manual GPS entry ──────────────────────────────────────────

  it('applies manual GPS coordinates', () => {
    renderForm();
    const latInput = screen.getByPlaceholderText('-6.823490');
    const lngInput = screen.getByPlaceholderText('39.269510');

    fireEvent.change(latInput, { target: { value: '-6.82349' } });
    fireEvent.change(lngInput, { target: { value: '39.26951' } });
    fireEvent.click(screen.getByText(/使用手动坐标|Use Manual Coordinates/));

    // GPS badge should appear
    expect(screen.getByText('GPS OK')).toBeInTheDocument();
  });

  // ── TC 7: Invalid manual GPS rejection ──────────────────────────────

  it('shows warning for invalid manual coordinates', () => {
    renderForm();
    const latInput = screen.getByPlaceholderText('-6.823490');
    fireEvent.change(latInput, { target: { value: 'not-a-number' } });
    fireEvent.click(screen.getByText(/使用手动坐标|Use Manual Coordinates/));

    expect(mockShowToast).toHaveBeenCalledWith(
      expect.stringContaining('坐标'),
      'warning',
    );
  });

  // ── TC 8: Geolocation unavailable message ───────────────────────────

  it('shows toast when geolocation is not supported', () => {
    setupGeolocation(false);
    renderForm();
    fireEvent.click(screen.getByText('Get GPS'));
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.stringContaining('不支持 GPS'),
      'warning',
    );
  });

  // ── TC 9: Full successful submit flow ───────────────────────────────

  it('completes successful submission and shows success screen', async () => {
    mockOnSubmit.mockResolvedValue(undefined);
    renderForm();

    // Fill form
    fireEvent.change(screen.getByPlaceholderText('M-00X'), { target: { value: 'M-999' } });
    fireEvent.change(screen.getByPlaceholderText('Shop Name'), { target: { value: 'Test Shop' } });
    fireEvent.change(screen.getByPlaceholderText('Owner Name'), { target: { value: 'Test Owner' } });
    fireEvent.change(screen.getByPlaceholderText('Kariakoo'), { target: { value: 'Kariakoo' } });
    // Get GPS
    fireEvent.click(screen.getByText('Get GPS'));

    // Submit
    fireEvent.click(screen.getByText(/完成注册|Hifadhi Sasa/));

    // Fast-forward the 800ms delay
    jest.advanceTimersByTime(800);

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledTimes(1);
    });

    // Success screen
    await waitFor(() => {
      expect(screen.getByText(/入网成功|Usajili Umekamilika/)).toBeInTheDocument();
    });

    // Registered details
    expect(screen.getByText('M-999')).toBeInTheDocument();
    expect(screen.getByText('Test Shop')).toBeInTheDocument();
    expect(screen.getByText('Kariakoo')).toBeInTheDocument();
  });

  // ── TC 10: Handles submit error ─────────────────────────────────────

  it('displays error message when submission fails', async () => {
    mockOnSubmit.mockRejectedValue(new Error('Network failure'));
    renderForm();

    fireEvent.change(screen.getByPlaceholderText('M-00X'), { target: { value: 'M-999' } });
    fireEvent.change(screen.getByPlaceholderText('Shop Name'), { target: { value: 'Test Shop' } });
    fireEvent.change(screen.getByPlaceholderText('Owner Name'), { target: { value: 'Test Owner' } });
    fireEvent.change(screen.getByPlaceholderText('Kariakoo'), { target: { value: 'Kariakoo' } });
    fireEvent.click(screen.getByText('Get GPS'));

    fireEvent.click(screen.getByText(/完成注册|Hifadhi Sasa/));
    jest.advanceTimersByTime(800);

    await waitFor(() => {
      expect(screen.getByText(/注册失败|Registration failed/)).toBeInTheDocument();
    });
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.stringContaining('注册失败'),
      'error',
    );
  });

  // ── TC 11: Reset after success ──────────────────────────────────────

  it('resets form when "register another" is clicked after success', async () => {
    mockOnSubmit.mockResolvedValue(undefined);
    renderForm();

    // Submit successfully
    fireEvent.change(screen.getByPlaceholderText('M-00X'), { target: { value: 'M-999' } });
    fireEvent.change(screen.getByPlaceholderText('Shop Name'), { target: { value: 'Test Shop' } });
    fireEvent.change(screen.getByPlaceholderText('Owner Name'), { target: { value: 'Test Owner' } });
    fireEvent.change(screen.getByPlaceholderText('Kariakoo'), { target: { value: 'Kariakoo' } });
    fireEvent.click(screen.getByText('Get GPS'));
    fireEvent.click(screen.getByText(/完成注册|Hifadhi Sasa/));
    jest.advanceTimersByTime(800);

    await waitFor(() => {
      expect(screen.getByText(/入网成功|Usajili Umekamilika/)).toBeInTheDocument();
    });

    // Click "register another"
    fireEvent.click(screen.getByText(/继续注册下一台|Sajili Mashine Nyingine/));

    // Back to form
    expect(screen.getByPlaceholderText('M-00X')).toBeInTheDocument();
    // Machine ID should be cleared
    expect(screen.getByPlaceholderText('M-00X')).toHaveDisplayValue('');
  });

  // ── TC 12: Calls onCancel from back button ──────────────────────────

  it('calls onCancel when back arrow is clicked', () => {
    renderForm();
    // The back button is the ArrowLeft icon — find by role
    const backBtn = screen.getByRole('button', { name: '' });
    // Actually the back button has an ArrowLeft icon. Let's find it differently.
    const buttons = screen.getAllByRole('button');
    // First button should be the back arrow (ArrowLeft)
    fireEvent.click(buttons[0]);
    expect(mockOnCancel).toHaveBeenCalled();
  });

  // ── TC 13: Cancel button in form header ─────────────────────────────

  it('has a cancel button in the header that calls onCancel', () => {
    renderForm();
    const cancelBtn = screen.getByRole('button', { name: '' });
    fireEvent.click(cancelBtn);
    expect(mockOnCancel).toHaveBeenCalled();
  });
});
