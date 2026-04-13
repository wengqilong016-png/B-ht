import { describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import React from 'react';

import AccountSettings from '../components/AccountSettings';

jest.mock('../repositories/authRepository', () => ({
  updatePassword: jest.fn(),
}));

jest.mock('../services/authService', () => ({
  updateUserEmail: jest.fn(),
}));

describe('AccountSettings', () => {
  it('blocks driver-side sensitive account editing and redirects them to My Status', () => {
    render(
      <AccountSettings
        currentUser={{
          id: 'user-1',
          name: 'Rajabu',
          username: 'rajabu@bht.com',
          role: 'driver',
          driverId: 'RAJABU',
        }}
        lang="zh"
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByText('司机设置已迁移')).toBeTruthy();
    expect(screen.getByText(/不再在这里维护/)).toBeTruthy();
    expect(screen.queryByText('修改密码')).toBeNull();
    expect(screen.queryByText('修改邮箱')).toBeNull();
  });
});
