# Perpetuals

## Generate UML diagram for solidity files
   ### using sol2uml
   ```sh
      npx sol2uml ./contracts/(define file location)
   ``` 
   ### using surya to get uml 
   ```sh
      npx surya graph contracts/file location/*.sol | dot -Tpng > ImageName.png
      # example for matching engine folder 
      # npx surya graph contracts/matching-engine/*.sol  | dot -Tpng > MatchingEngine.png
      # For file 
      # npx surya graph contracts/matching-engine/MatchingEngineCore.sol | dot -Tpng > MatchingEngineCore.png
   ```   
   ### using solgraph to determine function calls and event emits
   ```sh
      npx solgraph ./contracts/file location > contractname.dot
      dot -Tpng contractname.dot -o contractname.png

      # example for matching engine 
      # npx solgraph ./contracts/matching-engine/MatchingEngineCore.sol > MatchingEngine.dot
      # dot -Tpng MatchingEngine.dot -o MyContract.png
   ```   
## Generate documentation 
  ```sh
     npx hardhat docgen
  ```   

