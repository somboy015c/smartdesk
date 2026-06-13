const { test, expect } = require('@playwright/test');

const samplePackage = {
  type: 'smart-desk-attendance-package',
  version: 1,
  generatedAt: '2026-06-08T12:00:00.000Z',
  source: 'Smart Desk Test',
  meeting: {
    id: 'meeting-test-1',
    name: 'Regular CDS Meeting',
    type: 'regular',
    date: '2026-06-08',
    time: '09:00',
    venue: 'NYSC Secretariat',
    description: 'Smoke test package',
  },
  cdsGroup: {
    id: 'group-test-1',
    name: 'DL4ALL CDS',
  },
  members: [
    {
      id: 'member-test-1',
      fullName: 'Amina Bello',
      surname: 'Bello',
      firstName: 'Amina',
      stateCodeNumber: 'NYSC/2026/001',
    },
    {
      id: 'member-test-2',
      fullName: 'Tunde Okoro',
      surname: 'Okoro',
      firstName: 'Tunde',
      stateCodeNumber: 'NYSC/2026/002',
    },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
});

test('desktop LGI app opens and logs in', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('#loginScreen')).toBeVisible();

  await page.locator('#loginBtn').click();

  await expect(page.locator('#appContainer')).toBeVisible();
  await expect(page.locator('#orgInfoMandatoryModal')).toBeVisible();

  await page.locator('#mandatoryLgaName').fill('Demo LGA');
  await page.locator('#mandatoryStateName').fill('Taraba');
  await page.locator('#orgInfoMandatoryModal button', { hasText: 'Save & Continue' }).click();

  await expect(page.locator('#pageDashboard')).toBeVisible();
  await expect(page.locator('#statActiveGroups')).not.toHaveText('0');
});

test('CDS app logs in and receives a package by pairing code', async ({ page }) => {
  await page.goto('/');
  await page.evaluate((attendancePackage) => {
    localStorage.setItem(
      'smart_desk_pairing_packages_v1',
      JSON.stringify({ 'TEST-CODE': { package: attendancePackage } })
    );
  }, samplePackage);

  await page.goto('/cds.html');
  await page.locator('#loginForm button[type="submit"]').click();

  await expect(page.locator('#appShell')).toBeVisible();
  await expect(page.locator('#panelReceive')).toBeVisible();

  await page.locator('#receivePairingCode').fill('TEST-CODE');
  await page.locator('#receivePairingBtn').click();

  await expect(page.locator('#panelDashboard')).toBeVisible();
  await expect(page.locator('#topTitle')).toHaveText('DL4ALL CDS');

  await page.locator('.tab-btn[data-panel="attendance"]').click();
  await expect(page.locator('#attendanceContent')).toContainText('Amina Bello');
  await page.getByRole('button', { name: 'Present' }).click();
  await expect(page.locator('#attendanceProgress')).toContainText('1 of 2');
});

test('entire LGI to CDS attendance exchange works', async ({ page, context }) => {
  test.skip(test.info().project.name !== 'desktop-chrome', 'The full LGI workflow is covered in the desktop project.');

  await page.goto('/index.html');
  await page.locator('#loginBtn').click();
  await expect(page.locator('#appContainer')).toBeVisible();

  await page.locator('#mandatoryLgaName').fill('Demo LGA');
  await page.locator('#mandatoryStateName').fill('Taraba');
  await page.locator('#orgInfoMandatoryModal button', { hasText: 'Save & Continue' }).click();
  await expect(page.locator('#orgInfoMandatoryModal')).toBeHidden();

  await page.locator('.nav-item[data-page="groups"]').click();
  await page.locator('#pageGroups').getByRole('button', { name: /Create Group/ }).click();
  await page.locator('#groupName').fill('QA CDS');
  await page.locator('#groupModal .btn-primary').click();
  await expect(page.locator('#groupsTableBody')).toContainText('QA CDS');

  await page.locator('.nav-item[data-page="corps"]').click();
  await page.locator('#pageCorps').getByRole('button', { name: /Register Member/ }).click();
  await page.locator('#regFileNumber').fill('QA/FN/001');
  await page.locator('#regStateCodeNumber').fill('NYSC/2026/QA001');
  await page.locator('#regSurname').fill('Test');
  await page.locator('#regFirstName').fill('Ada');
  await page.locator('#regDob').fill('1998-01-10');
  await page.locator('#regSex').selectOption('Female');
  await page.locator('#regMaritalStatus').selectOption('Single');
  await page.locator('#regGroup').selectOption({ label: 'QA CDS' });
  await page.locator('#regBatch').selectOption({ label: 'Batch A 2025 Stream 1' });
  await page.locator('#regPpa').fill('QA Primary School');
  await page.locator('#registerModal .btn-primary').click();
  await expect(page.locator('#corpsTableBody')).toContainText('NYSC/2026/QA001');

  await page.locator('.nav-item[data-page="meetings"]').click();
  await page.locator('#pageMeetings').getByRole('button', { name: /Create Meeting/ }).click();
  await page.locator('#meetingTypeSelect').selectOption('specific');
  await page.locator('#groupsCheckboxContainer label', { hasText: 'QA CDS' }).click();
  await page.locator('#meetingVenue').fill('NYSC Secretariat');
  await page.locator('#meetingDate').fill('2026-06-08');
  await page.locator('#meetingTime').fill('09:00');
  await page.locator('#meetingDesc').fill('Full workflow test meeting');
  await page.locator('#meetingModal .btn-primary').click();
  await expect(page.locator('#meetingsTableBody')).toContainText('Specific CDS Meeting');

  await page.locator('.nav-item[data-page="attendance"]').click();
  const meetingOption = page.locator('#attendanceMeetingFilter option', {
    hasText: 'Specific CDS Meeting (2026-06-08)',
  });
  const meetingId = await meetingOption.getAttribute('value');
  expect(meetingId).toBeTruthy();
  await page.locator('#attendanceMeetingFilter').selectOption(meetingId);
  await page.getByRole('button', { name: 'Load Records' }).click();

  const qaRow = page.locator('#attendanceTableBody tr', { hasText: 'QA CDS' });
  await expect(qaRow).toContainText('0/1 received');
  await qaRow.getByRole('button', { name: /Share/ }).click();
  await expect(page.locator('#shareModal')).toBeVisible();
  await page.getByRole('button', { name: /Generate Pairing Code/ }).click();
  const pairingCode = (await page.locator('#pairingCodeValue').textContent()).trim();
  expect(pairingCode).toMatch(/[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+/);

  const cdsPage = await context.newPage();
  await cdsPage.goto('/cds.html');
  await cdsPage.locator('#loginForm button[type="submit"]').click();
  await expect(cdsPage.locator('#panelReceive')).toBeVisible();
  await cdsPage.locator('#receivePairingCode').fill(pairingCode);
  await cdsPage.locator('#receivePairingBtn').click();
  await expect(cdsPage.locator('#topTitle')).toHaveText('QA CDS');

  await cdsPage.locator('.tab-btn[data-panel="attendance"]').click();
  await expect(cdsPage.locator('#attendanceContent')).toContainText('Test Ada');
  await cdsPage.getByRole('button', { name: 'Present' }).click();
  await expect(cdsPage.locator('#attendanceProgress')).toContainText('1 of 1');
  await cdsPage.locator('#openSubmitFromAttendance').click();
  await expect(cdsPage.locator('#submitModal')).toBeVisible();
  await cdsPage.locator('#sendResultByCodeBtn').click();
  await expect(cdsPage.locator('#submitNotice')).toContainText('Attendance result sent');
  await cdsPage.close();

  await page.locator('#shareModal .modal-close').click();
  await expect(page.locator('#shareModal')).toBeHidden();
  await qaRow.getByRole('button', { name: /Receive/ }).click();
  await expect(page.locator('#receiveModal')).toBeVisible();
  await page.getByRole('button', { name: /Enter Pairing Code/ }).click();
  await page.locator('#pairingCodeInput').fill(pairingCode);
  await page.getByRole('button', { name: 'Sync Now' }).click();
  await expect(page.locator('#receiveStatus')).toContainText('Received 1 attendance record');
  await expect(qaRow).toContainText('Submitted (1/1 present)');
});
