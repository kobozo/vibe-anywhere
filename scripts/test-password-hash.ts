import bcrypt from 'bcrypt';

const password = 'vibe-anywhere';
const hash = '$2b$12$C12o2o71HFcrmN3T..mLPOoBmU4zYl5vRUQeT6sbB9BMLIWe6Q0SW';

console.log('Testing password hash...');
console.log('Password:', password);
console.log('Hash:', hash);

bcrypt.compare(password, hash).then((result) => {
  console.log('Match:', result);
  if (result) {
    console.log('✅ Password hash is CORRECT');
  } else {
    console.log('❌ Password hash is INCORRECT');
    console.log('\nGenerating correct hash...');
    bcrypt.hash(password, 12).then((newHash) => {
      console.log('New hash:', newHash);
    });
  }
}).catch((err) => {
  console.error('Error:', err);
});
