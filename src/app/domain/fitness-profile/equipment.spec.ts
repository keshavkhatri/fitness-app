import { equipmentOfferedAt, pruneEquipmentForLocation, toggleEquipment } from './equipment';

const ids = (location: Parameters<typeof equipmentOfferedAt>[0]) => equipmentOfferedAt(location).map((e) => e.id);

describe('equipment', () => {
  describe('options by location', () => {
    it('does not offer gym-only equipment to home users', () => {
      const home = ids('home');
      expect(home).not.toContain('full-gym');
      expect(home).not.toContain('machines');
      expect(home).not.toContain('cable-machine');
      expect(home).toContain('dumbbells');
      expect(home).toContain('bodyweight-only');
    });

    it('offers everything for gym and both', () => {
      expect(ids('gym')).toContain('full-gym');
      expect(ids('both')).toEqual(ids(null));
    });
  });

  describe('toggleEquipment', () => {
    it('adds and removes items, keeping catalog order', () => {
      let selection = toggleEquipment([], 'bench');
      selection = toggleEquipment(selection, 'dumbbells');
      expect(selection).toEqual(['dumbbells', 'bench']);

      expect(toggleEquipment(selection, 'bench')).toEqual(['dumbbells']);
    });

    it('treats "bodyweight only" as exclusive in both directions', () => {
      expect(toggleEquipment(['dumbbells', 'bench'], 'bodyweight-only')).toEqual(['bodyweight-only']);
      expect(toggleEquipment(['bodyweight-only'], 'pull-up-bar')).toEqual(['pull-up-bar']);
    });
  });

  it('prunes equipment not offered at a new location', () => {
    expect(pruneEquipmentForLocation(['full-gym', 'dumbbells', 'machines'], 'home')).toEqual(['dumbbells']);
    expect(pruneEquipmentForLocation(['dumbbells'], 'gym')).toEqual(['dumbbells']);
  });
});
