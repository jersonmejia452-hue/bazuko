import { test, expect } from '@playwright/test';

test('la apariencia realista se compara en vivo y conserva el personaje y sus animaciones', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /shader|WebGLProgram/i.test(message.text())) errors.push(message.text());
  });
  await page.goto('/sala.html?prueba=personaje&animaciones=mixamo-preview&aspecto=realista');
  await expect(page.locator('#sala-aspecto-estado')).toHaveAttribute('data-profile', 'street-preview');
  await expect(page.locator('#sala-banco-estado')).toContainText('9 clips cargados');
  const original = await page.evaluate(() => ({ look: window.__sala.player.look, profile: window.__sala.player.character.animationProfile }));
  await page.getByRole('button', { name: 'Pausar', exact: true }).click();
  for (const [profile, name] of [['default', 'Antes'], ['street-preview', 'Despues'], ['default', 'Restaurado'], ['street-preview', 'Final']]) {
    await page.getByRole('combobox', { name: 'Apariencia del personaje', exact: true }).selectOption(profile);
    await expect(page.locator('#sala-aspecto-estado')).toHaveAttribute('data-profile', profile);
    const result = await page.evaluate(() => {
      const sala = window.__sala;
      sala.renderer.setQuality('alta');
      sala.renderer.instance.setPixelRatio(1);
      sala.animationPreview.play('reposo');
      for (let i = 0; i < 120; i++) sala.animationPreview.update(1 / 60);
      const meshes = [];
      sala.player.character.group.traverse(node => {
        if (node.isSkinnedMesh) meshes.push({ name: node.name, vertices: node.geometry.attributes.position.count });
      });
      return { look: sala.player.look, profile: sala.player.character.animationProfile, meshes };
    });
    expect(result.look).toEqual(original.look);
    expect(result.profile).toBe(original.profile);
    expect(result.meshes.length).toBeGreaterThan(4);
    await page.getByRole('button', { name: 'Ver rostro', exact: true }).click();
    await page.locator('#sala-panel').evaluate(element => { element.scrollTop = 0; });
    await page.screenshot({ path: testInfo.outputPath(`${name}-rostro.png`) });
    await page.getByRole('button', { name: 'Cuerpo completo', exact: true }).click();
    await page.screenshot({ path: testInfo.outputPath(`${name}-cuerpo.png`) });
  }
  await expect(page).toHaveURL(/aspecto=realista/);
  await page.setViewportSize({ width: 432, height: 883 });
  await page.getByRole('button', { name: 'Cuerpo completo', exact: true }).click();
  await expect(page.locator('#sala-panel')).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath('Final-estrecho.png') });
  await page.getByRole('button', { name: 'Mostrar controles', exact: true }).click();
  await expect(page.locator('#sala-panel')).toBeVisible();
  await page.getByRole('button', { name: 'Ver rostro', exact: true }).click();
  await expect(page.locator('#sala-panel')).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath('Final-rostro-estrecho.png') });
  expect(errors).toEqual([]);
});
